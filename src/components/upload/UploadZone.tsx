'use client';

import { useCallback, useState, useEffect } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  status: 'uploading' | 'success' | 'error';
  error?: string;
  uploadedId?: string;
}

interface UploadZoneProps {
  onUpload?: (files: File[]) => void;
  maxFiles?: number;
  className?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function UploadZone({ onUpload, maxFiles = 10, className = "" }: UploadZoneProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Cleanup: Revoke object URLs on unmount
  useEffect(() => {
    const files = uploadedFiles;
    return () => {
      files.forEach(fileObj => {
        URL.revokeObjectURL(fileObj.preview);
      });
    };
  }, [uploadedFiles]);

  const uploadFile = async (fileObj: UploadedFile) => {
    try {
      const formData = new FormData();
      formData.append('file', fileObj.file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Upload failed');
      }

      const result = await response.json();

      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === fileObj.id
            ? { ...f, status: 'success', uploadedId: result.id }
            : f
        )
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === fileObj.id
            ? { ...f, status: 'error', error: errorMessage }
            : f
        )
      );
    }
  };

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    // Handle rejected files
    if (rejectedFiles.length > 0) {
      rejectedFiles.forEach(({ file, errors }) => {
        const errorMessages = errors.map((e) => {
          if (e.code === 'file-too-large') {
            return `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
          }
          return e.message;
        }).join(', ');

        const rejectedFileObj: UploadedFile = {
          id: Math.random().toString(36).substring(2),
          file,
          preview: '',
          status: 'error',
          error: errorMessages,
        };

        setUploadedFiles(prev => [...prev, rejectedFileObj]);
      });
    }

    // Client-side file size validation for better UX
    const validFiles = acceptedFiles.filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        const errorFileObj: UploadedFile = {
          id: Math.random().toString(36).substring(2),
          file,
          preview: URL.createObjectURL(file),
          status: 'error',
          error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
        };
        setUploadedFiles(prev => [...prev, errorFileObj]);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const newFiles = validFiles.map(file => ({
      id: Math.random().toString(36).substring(2),
      file,
      preview: URL.createObjectURL(file),
      status: 'uploading' as const,
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);

    // Upload files to server
    newFiles.forEach(fileObj => {
      uploadFile(fileObj);
    });

    onUpload?.(validFiles);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    },
    maxFiles,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  const removeFile = (id: string) => {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file && file.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  return (
    <div className={`w-full max-w-4xl mx-auto ${className}`}>
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`
          drop-zone hover-lift
          ${isDragActive 
            ? 'drop-zone-active' 
            : 'drop-zone-inactive'
          }
        `}
      >
        <input {...getInputProps()} />
          <div className="space-y-4">
            <div className={`transform transition-transform ${isDragActive ? 'scale-110' : 'scale-100'}`}>
              <Upload className="h-16 w-16 text-slate-400 mx-auto mb-4" />
            </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2">
              {isDragActive ? 'Drop your images here!' : 'Upload your photos'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              Drag and drop your images here, or click to browse
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">
              Supports JPEG, PNG, WebP up to 10MB each
            </p>
            </div>
          </div>
        </div>

      {/* Upload Progress */}
      <AnimatePresence>
        {uploadedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-8 space-y-4"
          >
            <h4 className="text-lg font-semibold">Uploading Files</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadedFiles.map((fileObj) => (
                <motion.div
                  key={fileObj.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative card-base p-4"
                >
                  <button
                    onClick={() => removeFile(fileObj.id)}
                    className="absolute top-2 right-2 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors z-10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  
                  {fileObj.preview && (
                    <div className="relative aspect-square mb-3 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                      <img 
                        src={fileObj.preview} 
                        alt={fileObj.file.name}
                        className="w-full h-full object-cover"
                      />
                      {fileObj.status === 'success' && (
                        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                          <CheckCircle className="h-8 w-8 text-green-500" />
                        </div>
                      )}
                      {fileObj.status === 'error' && (
                        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                          <AlertCircle className="h-8 w-8 text-red-500" />
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">
                        {fileObj.file.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {(fileObj.file.size / 1024 / 1024).toFixed(1)}MB
                      </span>
                    </div>
                    
                    {fileObj.status === 'uploading' && (
                      <div className="flex items-center gap-2 text-blue-600 text-sm">
                        <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                        <span>Uploading...</span>
                      </div>
                    )}
                    
                    {fileObj.status === 'success' && (
                      <div className="flex items-center gap-2 text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4" />
                        <span>Upload complete</span>
                      </div>
                    )}

                    {fileObj.status === 'error' && (
                      <div className="flex items-center gap-2 text-red-600 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        <span className="truncate">{fileObj.error || 'Upload failed'}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
