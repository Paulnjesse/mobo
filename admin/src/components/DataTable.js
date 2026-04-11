import React, { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  Typography,
  Skeleton,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as VisibilityIcon,
  Edit as EditIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

export default function DataTable({
  columns = [],
  rows = [],
  loading = false,
  searchPlaceholder = 'Search...',
  onView,
  onEdit,
  onSuspend,
  onUnsuspend,
  onDelete,
  actions = true,
  rowsPerPageOptions = [10, 25, 50],
  defaultRowsPerPage = 10,
  getRowSuspended,
  emptyMessage = 'No records found',
  extraActions,
  searchKeys,
  externalSearch,
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);

  const filteredRows = useMemo(() => {
    if (externalSearch !== undefined) return rows;
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) => {
      const keys = searchKeys || columns.map((c) => c.field);
      return keys.some((key) => {
        const val = String(row[key] || '').toLowerCase();
        return val.includes(q);
      });
    });
  }, [rows, search, columns, externalSearch, searchKeys]);

  const paginatedRows = useMemo(() => {
    return filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const skeletonRows = Array.from({ length: 5 });

  return (
    <Paper elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Search Bar */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid rgba(0,0,0,0.06)', backgroundColor: '#fafafa' }}>
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={externalSearch !== undefined ? externalSearch : search}
          onChange={handleSearchChange}
          disabled={externalSearch !== undefined}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'rgba(0,0,0,0.4)' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            width: { xs: '100%', sm: 300 },
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              fontSize: '0.85rem',
              backgroundColor: '#ffffff',
            },
          }}
        />
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.field}
                  align={col.align || 'left'}
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    color: 'rgba(0,0,0,0.7)',
                    py: 1.5,
                    whiteSpace: 'nowrap',
                    borderBottom: '2px solid rgba(0,0,0,0.08)',
                    backgroundColor: '#F8F9FA',
                    ...(col.width ? { width: col.width } : {}),
                  }}
                >
                  {col.headerName}
                </TableCell>
              ))}
              {actions && (
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    color: 'rgba(0,0,0,0.7)',
                    py: 1.5,
                    borderBottom: '2px solid rgba(0,0,0,0.08)',
                    backgroundColor: '#F8F9FA',
                    width: 140,
                  }}
                >
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? skeletonRows.map((_, idx) => (
                  <TableRow key={idx}>
                    {columns.map((col) => (
                      <TableCell key={col.field} sx={{ py: 1.2 }}>
                        <Skeleton variant="text" width={col.skeletonWidth || '80%'} height={20} />
                      </TableCell>
                    ))}
                    {actions && (
                      <TableCell align="right" sx={{ py: 1.2 }}>
                        <Skeleton variant="text" width={100} height={20} />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              : paginatedRows.length === 0
              ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (actions ? 1 : 0)}
                    align="center"
                    sx={{ py: 6 }}
                  >
                    <Typography sx={{ color: 'rgba(0,0,0,0.4)', fontSize: '0.9rem' }}>
                      {emptyMessage}
                    </Typography>
                  </TableCell>
                </TableRow>
              )
              : paginatedRows.map((row, rowIdx) => {
                  const isSuspended = getRowSuspended ? getRowSuspended(row) : row.suspended || row.status === 'suspended';
                  return (
                    <TableRow
                      key={row.id || row._id || rowIdx}
                      hover
                      sx={{
                        '&:hover': { backgroundColor: 'rgba(0,0,0,0.025)' },
                        opacity: isSuspended ? 0.7 : 1,
                      }}
                    >
                      {columns.map((col) => (
                        <TableCell
                          key={col.field}
                          align={col.align || 'left'}
                          sx={{
                            py: 1.2,
                            fontSize: '0.82rem',
                            color: '#000000',
                            borderBottom: '1px solid rgba(0,0,0,0.05)',
                            whiteSpace: col.noWrap ? 'nowrap' : 'normal',
                          }}
                        >
                          {col.renderCell ? col.renderCell(row) : (
                            <Typography sx={{ fontSize: '0.82rem' }}>
                              {row[col.field] !== undefined && row[col.field] !== null
                                ? String(row[col.field])
                                : '—'}
                            </Typography>
                          )}
                        </TableCell>
                      ))}
                      {actions && (
                        <TableCell align="right" sx={{ py: 1, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.3 }}>
                            {extraActions && extraActions(row)}
                            {onView && (
                              <Tooltip title="View Details" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => onView(row)}
                                  sx={{ color: '#000000', '&:hover': { backgroundColor: 'rgba(0,0,0,0.08)' } }}
                                >
                                  <VisibilityIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {onEdit && (
                              <Tooltip title="Edit" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => onEdit(row)}
                                  sx={{ color: '#FF8C00', '&:hover': { backgroundColor: 'rgba(255,140,0,0.1)' } }}
                                >
                                  <EditIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {onSuspend && onUnsuspend && (
                              isSuspended ? (
                                <Tooltip title="Unsuspend" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={() => onUnsuspend(row)}
                                    sx={{ color: '#4CAF50', '&:hover': { backgroundColor: 'rgba(76,175,80,0.1)' } }}
                                  >
                                    <CheckCircleIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Tooltip title="Suspend" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={() => onSuspend(row)}
                                    sx={{ color: '#FFD100', '&:hover': { backgroundColor: 'rgba(255,209,0,0.1)' } }}
                                  >
                                    <BlockIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              )
                            )}
                            {onDelete && (
                              <Tooltip title="Delete" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => onDelete(row)}
                                  sx={{ color: '#FFD100', '&:hover': { backgroundColor: 'rgba(255,209,0,0.1)' } }}
                                >
                                  <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={filteredRows.length}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={rowsPerPageOptions}
        sx={{
          borderTop: '1px solid rgba(0,0,0,0.06)',
          '& .MuiTablePagination-toolbar': { fontSize: '0.8rem' },
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: '0.8rem' },
        }}
      />
    </Paper>
  );
}
