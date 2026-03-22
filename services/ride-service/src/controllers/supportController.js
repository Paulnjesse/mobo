/**
 * Support Chat Controller
 * In-app 24/7 support with auto-bot triage + human agent escalation.
 */
const pool = require('../config/database');

// ── Bot response library ──────────────────────────────────────────────────────
const BOT_RESPONSES = {
  payment: [
    "I can help with payment issues! Common solutions:\n• Check your wallet balance under Account → Wallet\n• Verify your Mobile Money number is correct\n• Refunds take 3-5 business days\n\nWould you like me to escalate this to a human agent?",
  ],
  cancellation: [
    "Regarding cancellations:\n• Free cancellation within 2 minutes of booking\n• Cancellation fees: 350 XAF (2-5 min), 750 XAF (5+ min), 1,000 XAF (driver arrived)\n• Driver cancellations are free for you\n\nDo you need help with a specific cancellation charge?",
  ],
  lost_item: [
    "For lost items:\n1. Go to Ride History → find the trip\n2. Tap 'Report Lost Item'\n3. We'll notify your driver immediately\n\nDrivers hold items for 24 hours. A 1,000 XAF retrieval fee applies if found. Want me to connect you with an agent?",
  ],
  safety: [
    "Your safety is our priority. I'm escalating this to our Safety Team immediately — a human agent will respond within 5 minutes.\n\nIf you're in immediate danger, please call emergency services (117/118).",
  ],
  driver: [
    "For driver-related issues, I'm connecting you with a human agent who can review your trip details and take appropriate action. Expected wait: under 10 minutes.",
  ],
  account: [
    "For account issues:\n• Password reset: Profile → Settings → Change Password\n• Phone number change: requires OTP verification\n• Account deletion: Settings → Account → Delete Account\n\nNeed more help?",
  ],
  general: [
    "Thanks for contacting MOBO Support! I'm your virtual assistant.\n\nI can help with: payments, cancellations, lost items, safety, driver issues, and account questions.\n\nWhat can I help you with today?",
  ],
};

function getBotReply(category) {
  const replies = BOT_RESPONSES[category] || BOT_RESPONSES.general;
  return replies[Math.floor(Math.random() * replies.length)];
}

// Escalate immediately for safety/driver issues
const ESCALATE_IMMEDIATELY = ['safety', 'driver'];

// ── Create or reopen a support ticket ────────────────────────────────────────
const createTicket = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { subject, category = 'general', ride_id } = req.body;

    // Check for existing open ticket in same category (avoid duplicates)
    const existing = await pool.query(
      `SELECT id FROM support_tickets
       WHERE user_id = $1 AND category = $2 AND status NOT IN ('resolved','closed')
       ORDER BY created_at DESC LIMIT 1`,
      [userId, category]
    );
    if (existing.rows[0]) {
      return res.json({ ticket_id: existing.rows[0].id, existing: true });
    }

    const priority = ESCALATE_IMMEDIATELY.includes(category) ? 'high' : 'normal';

    const ticket = await pool.query(
      `INSERT INTO support_tickets (user_id, subject, category, priority, ride_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, subject, category, priority, ride_id || null]
    );
    const ticketId = ticket.rows[0].id;

    // Immediately post bot greeting
    const botMsg = getBotReply(category);
    await pool.query(
      `INSERT INTO support_messages (ticket_id, sender_role, content)
       VALUES ($1, 'bot', $2)`,
      [ticketId, botMsg]
    );

    // Auto-escalate urgent categories
    if (ESCALATE_IMMEDIATELY.includes(category)) {
      await pool.query(
        `UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
        [ticketId]
      );
    }

    res.status(201).json({ ticket: ticket.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── List user's tickets ───────────────────────────────────────────────────────
const getMyTickets = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      `SELECT t.*,
         (SELECT content FROM support_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
         (SELECT COUNT(*) FROM support_messages WHERE ticket_id = t.id AND is_read = false AND sender_role != 'user') as unread_count
       FROM support_tickets t
       WHERE t.user_id = $1
       ORDER BY t.updated_at DESC LIMIT 20`,
      [userId]
    );
    res.json({ tickets: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Get messages for a ticket ─────────────────────────────────────────────────
const getMessages = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.headers['x-user-id'];

    // Verify ownership
    const ticket = await pool.query(
      'SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2',
      [ticket_id, userId]
    );
    if (!ticket.rows[0]) return res.status(403).json({ error: 'Ticket not found' });

    const messages = await pool.query(
      `SELECT m.*, u.full_name as sender_name
       FROM support_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = $1 ORDER BY m.created_at ASC`,
      [ticket_id]
    );

    // Mark agent/bot messages as read
    await pool.query(
      `UPDATE support_messages SET is_read = true
       WHERE ticket_id = $1 AND sender_role != 'user' AND is_read = false`,
      [ticket_id]
    );

    res.json({ ticket: ticket.rows[0], messages: messages.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Send a message (user or agent) ───────────────────────────────────────────
const sendMessage = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.headers['x-user-id'];
    const { content } = req.body;

    const ticket = await pool.query('SELECT * FROM support_tickets WHERE id = $1', [ticket_id]);
    if (!ticket.rows[0]) return res.status(404).json({ error: 'Ticket not found' });

    const t = ticket.rows[0];
    const isOwner = t.user_id === userId;
    const senderRole = isOwner ? 'user' : 'agent';

    const msg = await pool.query(
      `INSERT INTO support_messages (ticket_id, sender_id, sender_role, content)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [ticket_id, userId, senderRole, content]
    );

    // Update ticket timestamp & status
    let newStatus = t.status;
    if (senderRole === 'user' && t.status === 'waiting_user') newStatus = 'in_progress';
    if (senderRole === 'agent' && t.status === 'open') newStatus = 'in_progress';

    await pool.query(
      `UPDATE support_tickets SET updated_at = NOW(), status = $1 WHERE id = $2`,
      [newStatus, ticket_id]
    );

    // Auto-bot reply if user sends message and no agent assigned yet
    if (senderRole === 'user' && !t.assigned_agent_id && t.status === 'open') {
      const escalateWords = ['urgent', 'emergency', 'fraud', 'stolen', 'danger', 'agent', 'human'];
      const wantsAgent = escalateWords.some((w) => content.toLowerCase().includes(w));
      if (wantsAgent) {
        const botMsg = "I'm connecting you with a human agent right away. Average wait time is under 10 minutes. Is there anything else you can tell me about your issue while we wait?";
        await pool.query(
          `INSERT INTO support_messages (ticket_id, sender_role, content) VALUES ($1,'bot',$2)`,
          [ticket_id, botMsg]
        );
        await pool.query(
          `UPDATE support_tickets SET status = 'in_progress', priority = 'high', updated_at = NOW() WHERE id = $1`,
          [ticket_id]
        );
      } else {
        // Contextual auto-reply
        const lc = content.toLowerCase();
        let botReply = null;
        if (lc.includes('pay') || lc.includes('charge') || lc.includes('refund')) botReply = getBotReply('payment');
        else if (lc.includes('cancel')) botReply = getBotReply('cancellation');
        else if (lc.includes('lost') || lc.includes('item') || lc.includes('left')) botReply = getBotReply('lost_item');
        else if (lc.includes('safe') || lc.includes('accident') || lc.includes('harass')) botReply = getBotReply('safety');

        if (botReply) {
          await pool.query(
            `INSERT INTO support_messages (ticket_id, sender_role, content) VALUES ($1,'bot',$2)`,
            [ticket_id, botReply]
          );
        }
      }
    }

    res.status(201).json({ message: msg.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Close a ticket ────────────────────────────────────────────────────────────
const closeTicket = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.headers['x-user-id'];
    await pool.query(
      `UPDATE support_tickets SET status = 'closed', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [ticket_id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin: get all open tickets (for agent dashboard) ────────────────────────
const getAllTickets = async (req, res) => {
  try {
    const { status = 'open', category } = req.query;
    const conditions = ['status = $1'];
    const params = [status];
    if (category) { conditions.push(`category = $${params.length + 1}`); params.push(category); }

    const result = await pool.query(
      `SELECT t.*, u.full_name as user_name, u.phone as user_phone
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.priority DESC, t.created_at ASC`,
      params
    );
    res.json({ tickets: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { createTicket, getMyTickets, getMessages, sendMessage, closeTicket, getAllTickets };
