import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { Spinner } from './Loader';
import { formatRelativeTime } from '../lib/utils';
import type { FileAttachment } from '../lib/types';
import { Paperclip, Trash2, Download, Upload } from 'lucide-react';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

interface FileAttachmentsProps {
  taskId?: string;
  projectId?: string;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachments({ taskId, projectId }: FileAttachmentsProps) {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { show } = useToast();
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    if (!currentOrg) return;
    setLoading(true);
    let query = supabase
      .from('file_attachments')
      .select('*')
      .eq('organization_id', currentOrg.id)
      .order('created_at', { ascending: false });

    if (taskId) query = query.eq('task_id', taskId);
    else if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) show('error', 'Could not load files', error.message);
    setFiles((data as FileAttachment[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchFiles(); }, [currentOrg, taskId, projectId]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !currentOrg || !user) return;
    const file = fileList[0];

    if (file.size > MAX_FILE_SIZE) {
      show('error', 'File too large', 'Max size is 15MB');
      return;
    }

    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${currentOrg.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, file, { upsert: false });

    if (uploadError) {
      show('error', 'Upload failed', uploadError.message);
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase.from('file_attachments').insert({
      organization_id: currentOrg.id,
      project_id: projectId || null,
      task_id: taskId || null,
      uploaded_by: user.id,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type || null,
    });

    if (dbError) {
      show('error', 'Failed to save file record', dbError.message);
      await supabase.storage.from('attachments').remove([storagePath]);
    } else {
      show('success', 'File uploaded', file.name);
      await fetchFiles();
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDownload = async (file: FileAttachment) => {
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(file.file_path, 60);

    if (error || !data) {
      show('error', 'Could not open file', error?.message);
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (file: FileAttachment) => {
    const { error: dbError } = await supabase.from('file_attachments').delete().eq('id', file.id);
    if (dbError) {
      show('error', 'Failed to delete', dbError.message);
      return;
    }
    await supabase.storage.from('attachments').remove([file.file_path]);
    show('success', 'File removed');
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
          <Paperclip size={13} /> Attachments
        </label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-xs text-teal-400 hover:text-teal-300 transition-smooth flex items-center gap-1 disabled:opacity-50"
        >
          {uploading ? <Spinner size={12} /> : <Upload size={12} />}
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-3"><Spinner size={16} /></div>
      ) : files.length === 0 ? (
        <p className="text-xs text-slate-600 py-2">No files attached yet.</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 group">
              <Paperclip size={14} className="text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200 truncate">{f.file_name}</p>
                <p className="text-[10px] text-slate-500">
                  {formatSize(f.file_size)} • {formatRelativeTime(f.created_at)}
                </p>
              </div>
              <button
                onClick={() => handleDownload(f)}
                className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-smooth"
                title="Download"
              >
                <Download size={13} />
              </button>
              {f.uploaded_by === user?.id && (
                <button
                  onClick={() => handleDelete(f)}
                  className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-rose-400 transition-smooth"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}