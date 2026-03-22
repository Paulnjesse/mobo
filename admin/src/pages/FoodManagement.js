import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Table, TableBody, TableCell,
  TableHead, TableRow, Paper, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Chip, Switch, FormControlLabel, Tabs, Tab,
  Grid, Card, CardContent, CircularProgress, Alert,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Restaurant as RestaurantIcon,
  MenuBook as MenuBookIcon, ShoppingBag as OrderIcon,
  CheckCircle, Cancel, HourglassEmpty,
} from '@mui/icons-material';
import api from '../services/api';

const STATUS_COLORS = {
  pending: 'warning', confirmed: 'info', preparing: 'info',
  picked_up: 'secondary', delivered: 'success', cancelled: 'error',
};

function fmt(xaf) {
  return `${Number(xaf || 0).toLocaleString()} XAF`;
}

export default function FoodManagement() {
  const [tab, setTab] = useState(0);

  // Restaurants tab
  const [restaurants, setRestaurants] = useState([]);
  const [loadingRest, setLoadingRest] = useState(true);
  const [restDialog, setRestDialog] = useState(false);
  const [editingRest, setEditingRest] = useState(null);
  const [restForm, setRestForm] = useState({ name: '', description: '', category: '', address: '', city: '', phone: '', delivery_fee: 500, min_order: 2000, is_active: true });

  // Orders tab
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState('');

  // Menu tab
  const [selectedRest, setSelectedRest] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [menuDialog, setMenuDialog] = useState(false);
  const [menuForm, setMenuForm] = useState({ name: '', description: '', category: '', price: '', is_popular: false });

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadRestaurants(); }, []);
  useEffect(() => { if (tab === 1) loadOrders(); }, [tab, orderStatusFilter]);
  useEffect(() => { if (selectedRest) loadMenu(selectedRest.id); }, [selectedRest]);

  const loadRestaurants = async () => {
    setLoadingRest(true);
    try {
      const res = await api.get('/food/admin/restaurants');
      setRestaurants(res.data.restaurants || []);
    } catch { setError('Failed to load restaurants'); }
    finally { setLoadingRest(false); }
  };

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const params = orderStatusFilter ? `?status=${orderStatusFilter}` : '';
      const res = await api.get(`/food/admin/orders${params}`);
      setOrders(res.data.orders || []);
    } catch { setError('Failed to load orders'); }
    finally { setLoadingOrders(false); }
  };

  const loadMenu = async (restaurantId) => {
    try {
      const res = await api.get(`/food/restaurants/${restaurantId}`);
      setMenuItems(res.data.menu || []);
    } catch { setError('Failed to load menu'); }
  };

  const openRestDialog = (rest = null) => {
    setEditingRest(rest);
    setRestForm(rest
      ? { name: rest.name, description: rest.description || '', category: rest.category || '', address: rest.address || '', city: rest.city || '', phone: rest.phone || '', delivery_fee: rest.delivery_fee, min_order: rest.min_order, is_active: rest.is_active }
      : { name: '', description: '', category: '', address: '', city: '', phone: '', delivery_fee: 500, min_order: 2000, is_active: true }
    );
    setRestDialog(true);
  };

  const saveRestaurant = async () => {
    setSaving(true);
    try {
      if (editingRest) {
        await api.patch(`/food/admin/restaurants/${editingRest.id}`, restForm);
      } else {
        await api.post('/food/admin/restaurants', restForm);
      }
      setRestDialog(false);
      loadRestaurants();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const saveMenuItem = async () => {
    if (!selectedRest) return;
    setSaving(true);
    try {
      await api.post(`/food/admin/restaurants/${selectedRest.id}/menu`, { ...menuForm, price: parseInt(menuForm.price) });
      setMenuDialog(false);
      loadMenu(selectedRest.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const updateMenuItemAvailability = async (itemId, is_available) => {
    try {
      await api.patch(`/food/admin/menu/${itemId}`, { is_available });
      if (selectedRest) loadMenu(selectedRest.id);
    } catch { setError('Update failed'); }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await api.patch(`/food/orders/${orderId}/status`, { status });
      loadOrders();
    } catch { setError('Status update failed'); }
  };

  // ── Stats cards ──────────────────────────────────────────────────────────────
  const totalRevenue = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.total || 0), 0);
  const pendingCount = orders.filter(o => ['pending', 'confirmed', 'preparing'].includes(o.status)).length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight={800} gutterBottom>Food Delivery</Typography>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Restaurants', value: restaurants.length, icon: <RestaurantIcon />, color: '#E94560' },
          { label: 'Active Orders', value: pendingCount, icon: <OrderIcon />, color: '#F5A623' },
          { label: 'Revenue (delivered)', value: fmt(totalRevenue), icon: <CheckCircle />, color: '#16a34a' },
          { label: 'Total Orders', value: orders.length, icon: <HourglassEmpty />, color: '#7c3aed' },
        ].map((s, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card elevation={0} sx={{ borderRadius: 2, border: '1px solid #f0f0f0' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ color: s.color, '& svg': { fontSize: 32 } }}>{s.icon}</Box>
                <Box>
                  <Typography variant="h5" fontWeight={800} color={s.color}>{s.value}</Typography>
                  <Typography variant="body2" color="text.secondary">{s.label}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Restaurants" icon={<RestaurantIcon />} iconPosition="start" />
        <Tab label="Orders" icon={<OrderIcon />} iconPosition="start" />
        <Tab label="Menu Editor" icon={<MenuBookIcon />} iconPosition="start" />
      </Tabs>

      {/* ── RESTAURANTS TAB ───────────────────────────────────────────────────── */}
      {tab === 0 && (
        <>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => openRestDialog()}>
              Add Restaurant
            </Button>
          </Box>
          <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 2 }}>
            {loadingRest ? (
              <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
            ) : (
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f9fafb' }}>
                    {['Name', 'Category', 'City', 'Delivery Fee', 'Min Order', 'Orders', 'Active', 'Actions'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {restaurants.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell>{r.city}</TableCell>
                      <TableCell>{fmt(r.delivery_fee)}</TableCell>
                      <TableCell>{fmt(r.min_order)}</TableCell>
                      <TableCell>{r.order_count || 0}</TableCell>
                      <TableCell>
                        <Chip label={r.is_active ? 'Active' : 'Inactive'} color={r.is_active ? 'success' : 'default'} size="small" />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => openRestDialog(r)} title="Edit">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <Button size="small" onClick={() => { setSelectedRest(r); setTab(2); }}>
                          Menu
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </>
      )}

      {/* ── ORDERS TAB ────────────────────────────────────────────────────────── */}
      {tab === 1 && (
        <>
          <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
            {['', 'pending', 'confirmed', 'preparing', 'picked_up', 'delivered', 'cancelled'].map((s) => (
              <Chip
                key={s || 'all'}
                label={s || 'All'}
                onClick={() => setOrderStatusFilter(s)}
                color={orderStatusFilter === s ? 'primary' : 'default'}
                variant={orderStatusFilter === s ? 'filled' : 'outlined'}
                size="small"
              />
            ))}
          </Box>
          <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 2 }}>
            {loadingOrders ? (
              <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
            ) : (
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f9fafb' }}>
                    {['Order ID', 'Customer', 'Restaurant', 'Total', 'Status', 'Time', 'Actions'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{o.id?.substring(0, 8).toUpperCase()}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell>{o.restaurant_name}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{fmt(o.total)}</TableCell>
                      <TableCell>
                        <Chip label={o.status} color={STATUS_COLORS[o.status] || 'default'} size="small" />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        {o.created_at ? new Date(o.created_at).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell>
                        {o.status === 'pending' && (
                          <Button size="small" onClick={() => updateOrderStatus(o.id, 'confirmed')}>Confirm</Button>
                        )}
                        {o.status === 'confirmed' && (
                          <Button size="small" onClick={() => updateOrderStatus(o.id, 'preparing')}>Preparing</Button>
                        )}
                        {o.status === 'preparing' && (
                          <Button size="small" onClick={() => updateOrderStatus(o.id, 'picked_up')}>Picked Up</Button>
                        )}
                        {o.status === 'picked_up' && (
                          <Button size="small" color="success" onClick={() => updateOrderStatus(o.id, 'delivered')}>Delivered</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </>
      )}

      {/* ── MENU EDITOR TAB ───────────────────────────────────────────────────── */}
      {tab === 2 && (
        <>
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              select size="small" label="Select restaurant"
              value={selectedRest?.id || ''}
              onChange={(e) => setSelectedRest(restaurants.find((r) => r.id === e.target.value) || null)}
              SelectProps={{ native: true }}
              sx={{ minWidth: 220 }}
            >
              <option value="">-- choose --</option>
              {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </TextField>
            {selectedRest && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setMenuForm({ name: '', description: '', category: '', price: '', is_popular: false }); setMenuDialog(true); }}>
                Add Item
              </Button>
            )}
          </Box>

          {selectedRest && (
            <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 2 }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f9fafb' }}>
                    {['Name', 'Category', 'Price', 'Popular', 'Available'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {menuItems.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{fmt(item.price)}</TableCell>
                      <TableCell>
                        <Chip label={item.is_popular ? 'Popular' : '-'} color={item.is_popular ? 'warning' : 'default'} size="small" />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={item.is_available}
                          onChange={(e) => updateMenuItemAvailability(item.id, e.target.checked)}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {menuItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                        No menu items yet — click "Add Item"
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}

      {/* ── Restaurant Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={restDialog} onClose={() => setRestDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRest ? 'Edit Restaurant' : 'Add Restaurant'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {['name', 'description', 'category', 'address', 'city', 'phone'].map((field) => (
            <TextField
              key={field}
              label={field.charAt(0).toUpperCase() + field.slice(1)}
              value={restForm[field]}
              onChange={(e) => setRestForm({ ...restForm, [field]: e.target.value })}
              fullWidth size="small"
              multiline={field === 'description'}
              rows={field === 'description' ? 2 : 1}
            />
          ))}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Delivery Fee (XAF)" type="number" value={restForm.delivery_fee} onChange={(e) => setRestForm({ ...restForm, delivery_fee: parseInt(e.target.value) || 0 })} size="small" fullWidth />
            <TextField label="Min Order (XAF)" type="number" value={restForm.min_order} onChange={(e) => setRestForm({ ...restForm, min_order: parseInt(e.target.value) || 0 })} size="small" fullWidth />
          </Box>
          <FormControlLabel control={<Switch checked={restForm.is_active} onChange={(e) => setRestForm({ ...restForm, is_active: e.target.checked })} />} label="Active" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveRestaurant} disabled={saving || !restForm.name}>
            {saving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Menu Item Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={menuDialog} onClose={() => setMenuDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Menu Item</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {['name', 'description', 'category'].map((field) => (
            <TextField key={field} label={field.charAt(0).toUpperCase() + field.slice(1)} value={menuForm[field]} onChange={(e) => setMenuForm({ ...menuForm, [field]: e.target.value })} fullWidth size="small" />
          ))}
          <TextField label="Price (XAF)" type="number" value={menuForm.price} onChange={(e) => setMenuForm({ ...menuForm, price: e.target.value })} fullWidth size="small" />
          <FormControlLabel control={<Switch checked={menuForm.is_popular} onChange={(e) => setMenuForm({ ...menuForm, is_popular: e.target.checked })} />} label="Mark as Popular" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMenuDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveMenuItem} disabled={saving || !menuForm.name || !menuForm.price}>
            {saving ? <CircularProgress size={20} /> : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
