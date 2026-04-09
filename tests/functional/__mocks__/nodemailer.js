const sendMail = jest.fn().mockResolvedValue({ messageId: 'mock-message-id' });
const transporter = { sendMail };
const createTransport = jest.fn().mockReturnValue(transporter);

module.exports = { createTransport };
