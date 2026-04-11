/**
 * DocumentManager.js
 *
 * Displays, uploads, and manages encrypted documents for a user or driver.
 * All uploads are AES-256-GCM encrypted server-side before storage.
 * All downloads are logged.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Chip, Button, IconButton, Tooltip, CircularProgress,
  Alert, Grid, Paper, LinearProgress,
} from '@mui/material';
import {
  Upload as UploadIcon,
  Download as DownloadIcon,
  CheckCircle as VerifiedIcon,
  Archive as ArchiveIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material';
import { adminDataAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const DOC_TYPE_LABELS = {
  national_id:          'National ID',
  driver_license:       'Driver License',
  vehicle_photo:        'Vehicle Photo',
  insurance:            'Insurance',
  profile_photo:        'Profile Photo',
  vehicle_registration: 'Vehicle Registration',
  other:                'Other Document',
};

const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS);

function FileTypeIcon({ mimeType }) {
  if (mimeType?.startsWith('image/')) return <ImageIcon sx={{ fontSize: 28, color: '#2196F3' }} />;
  if (mimeType === 'application/pdf') return <PdfIcon sx={{ fontSize: 28, color: '#E31837' }} />;
  return <FileIcon sx={{ fontSize: 28, color: '#9E9E9E' }} />;
}

export default function DocumentManager({ userId, readOnly = false }) {
  const { hasPermission } = useAuth();
  const canWrite   = !readOnly && hasPermission('users:write');
  const canArchive = !readOnly && hasPermission('users:archive');

  const [docs,       setDocs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [docType,    setDocType]    = useState('national_id');
  const fileRef = useRef(null);

  const fetchDocs = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await adminDataAPI.listDocuments(userId);
      setDocs(res.data?.documents || []);
    } catch { /* API may not be connected — silently fail */ }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const showMsg = (msg, isError = false) => {
    if (isError) setError(msg);
    else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showMsg('File too large (max 10 MB)', true); return; }

    setUploading(true); setProgress(10);
    try {
      // Convert to base64 for JSON upload (avoids CORS form-data issues)
      const reader = new FileReader();
      reader.onload = async (ev) => {
        setProgress(50);
        try {
          await adminDataAPI.uploadDocumentBase64(userId, {
            file_base64: ev.target.result,
            mime_type:   file.type,
            file_name:   file.name,
            doc_type:    docType,
          });
          setProgress(100);
          showMsg(`${DOC_TYPE_LABELS[docType] || docType} uploaded and encrypted successfully.`);
          fetchDocs();
        } catch (err) {
          showMsg(err.response?.data?.message || 'Upload failed', true);
        } finally { setUploading(false); setProgress(0); }
      };
      reader.readAsDataURL(file);
    } catch { setUploading(false); setProgress(0); }
    // Reset input so same file can be re-uploaded
    if (fileRef.current) fileRef.current.value = '';
  }, [userId, docType, fetchDocs]);

  const handleDownload = useCallback(async (doc) => {
    try {
      const res = await adminDataAPI.downloadDocument(doc.id);
      const blob = new Blob([res.data], { type: doc.mime_type || 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
      showMsg('Download complete — access has been logged.');
    } catch (err) {
      showMsg(err.response?.data?.message || 'Download failed', true);
    }
  }, []);

  const handleVerify = useCallback(async (doc) => {
    try {
      await adminDataAPI.verifyDocument(doc.id);
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, verified: true } : d));
      showMsg(`${doc.file_name} marked as verified.`);
    } catch { showMsg('Verification failed', true); }
  }, []);

  const handleArchive = useCallback(async (doc) => {
    try {
      await adminDataAPI.archiveDocument(doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      showMsg(`${doc.file_name} archived.`);
    } catch { showMsg('Archive failed', true); }
  }, []);

  return (
    <Box>
      <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', mb: 1.5 }}>
        Encrypted Documents
      </Typography>

      {error   && <Alert severity="error"   sx={{ mb: 1.5, borderRadius: '8px', py: 0.5 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 1.5, borderRadius: '8px', py: 0.5 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {canWrite && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: '10px', border: '1.5px dashed rgba(0,0,0,0.2)', bgcolor: '#FAFAFA' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box
              component="select"
              value={docType}
              onChange={e => setDocType(e.target.value)}
              disabled={uploading}
              sx={{
                border: '1px solid rgba(0,0,0,0.2)', borderRadius: '8px',
                px: 1.5, py: 0.8, fontSize: '0.82rem', cursor: 'pointer',
                bgcolor: '#fff', outline: 'none', flex: 1, minWidth: 160,
              }}
            >
              {DOC_TYPE_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </Box>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/*,application/pdf"
              onChange={handleFileChange}
            />
            <Button
              startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : <UploadIcon />}
              onClick={() => !uploading && fileRef.current?.click()}
              disabled={uploading}
              size="small"
              variant="contained"
              sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' }, borderRadius: '8px', whiteSpace: 'nowrap' }}
            >
              {uploading ? 'Encrypting…' : 'Upload & Encrypt'}
            </Button>
          </Box>
          {uploading && progress > 0 && (
            <LinearProgress variant="determinate" value={progress} sx={{ mt: 1, borderRadius: 2 }} />
          )}
          <Typography sx={{ fontSize: '0.7rem', color: '#888', mt: 0.8 }}>
            Files are AES-256-GCM encrypted before storage. Max 10 MB. Images + PDF only.
          </Typography>
        </Paper>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} sx={{ color: '#000000' }} />
        </Box>
      ) : docs.length === 0 ? (
        <Typography sx={{ color: '#BBB', fontSize: '0.82rem', textAlign: 'center', py: 2 }}>
          No documents uploaded yet
        </Typography>
      ) : (
        <Grid container spacing={1.5}>
          {docs.map(doc => (
            <Grid item xs={12} key={doc.id}>
              <Paper
                variant="outlined"
                sx={{ p: 1.5, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: 1.5 }}
              >
                <FileTypeIcon mimeType={doc.mime_type} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.file_name}
                    </Typography>
                    <Chip
                      label={DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                      size="small"
                      sx={{ bgcolor: 'rgba(0,0,0,0.08)', fontSize: '0.65rem', height: 18 }}
                    />
                    {doc.verified && (
                      <Chip
                        icon={<VerifiedIcon style={{ fontSize: 11 }} />}
                        label="Verified"
                        size="small"
                        sx={{ bgcolor: 'rgba(76,175,80,0.1)', color: '#4CAF50', fontSize: '0.65rem', height: 18 }}
                      />
                    )}
                    <Chip
                      label="Encrypted"
                      size="small"
                      sx={{ bgcolor: 'rgba(33,150,243,0.1)', color: '#2196F3', fontSize: '0.65rem', height: 18 }}
                    />
                  </Box>
                  <Typography sx={{ fontSize: '0.7rem', color: '#999', mt: 0.2 }}>
                    {doc.file_size_kb} KB · by {doc.uploaded_by_name || 'Admin'} · {new Date(doc.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.3, flexShrink: 0 }}>
                  <Tooltip title="Download (access will be logged)" arrow>
                    <IconButton size="small" onClick={() => handleDownload(doc)}
                      sx={{ color: '#2196F3', '&:hover': { bgcolor: 'rgba(33,150,243,0.1)' } }}>
                      <DownloadIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  {canWrite && !doc.verified && (
                    <Tooltip title="Mark as Verified" arrow>
                      <IconButton size="small" onClick={() => handleVerify(doc)}
                        sx={{ color: '#4CAF50', '&:hover': { bgcolor: 'rgba(76,175,80,0.1)' } }}>
                        <VerifiedIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canArchive && (
                    <Tooltip title="Archive document" arrow>
                      <IconButton size="small" onClick={() => handleArchive(doc)}
                        sx={{ color: '#FF6B35', '&:hover': { bgcolor: 'rgba(255,107,53,0.1)' } }}>
                        <ArchiveIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
