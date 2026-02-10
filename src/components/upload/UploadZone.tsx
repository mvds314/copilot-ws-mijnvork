'use client';

import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  errorMessage?: string;
}

interface UploadZoneProps {
  onUpload?: (files: File[]) => void;
  maxFiles?: number;
  className?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - client-side check for UX

export function UploadZone({ onUpload, maxFiles = 10, className = "" }: UploadZoneProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      uploadedFiles.forEach(fileObj => {
        URL.revokeObjectURL(fileObj.preview);
      });
    };
  }, [uploadedFiles]);

  const uploadFileToServer = useCallback(async (fileObj: UploadedFile) => {
    try {
      // Client-side size validation for UX (server also validates)
      if (fileObj.file.size > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      const formData = new FormData();
      formData.append('file', fileObj.file);
      formData.append('title', fileObj.file.name);
      // Tags could be added here if we had a tag selector in the UI

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      // Update status to success
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === fileObj.id
            ? { ...f, status: 'success', progress: 100 }
            : f
        )
      );

      onUpload?.([fileObj.file]);
    } catch (error) {
      // Update status to error
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === fileObj.id
            ? { 
                ...f, 
                status: 'error', 
                progress: 0,
                errorMessage: error instanceof Error ? error.message : 'Upload failed'
              }
            : f
        )
      );
    }
  }, [onUpload]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(2),
      file,
      preview: URL.createObjectURL(file),
      status: 'uploading' as const,
      progress: 0,
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);

    // Upload each file to the server
    newFiles.forEach(fileObj => {
      uploadFileToServer(fileObj);
    });
  }, [uploadFileToServer]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      // Client-side accept for UX only - server validates via magic bytes
      // Excluding SVG for security (not allowed on server)
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    },
    maxFiles,
    maxSize: MAX_FILE_SIZE, // Client-side size check for UX
    multiple: true,
  });

  const removeFile = (id: string) => {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) {
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
              Supports JPEG, PNG, WebP up to 10MB each (server validates all uploads)
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
              {uploadedFiles.map((fileObj) => (                  <motion.div
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
                  
                  <div className="relative aspect-square mb-3 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
                      <div className="progress-bar">
                        <motion.div
                          className="progress-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${fileObj.progress}%` }}
                          transition={{ duration: 0.2 }}
                        />
                      </div>
                    )}
                    
                    {fileObj.status === 'success' && (
                      <div className="flex items-center gap-2 text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4" />
                        <span>Upload complete</span>
                      </div>
                    )}
                    
                    {fileObj.status === 'error' && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-red-600 text-sm">
                          <AlertCircle className="h-4 w-4" />
                          <span>Upload failed</span>
                        </div>
                        {fileObj.errorMessage && (
                          <p className="text-xs text-red-500">{fileObj.errorMessage}</p>
                        )}
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
