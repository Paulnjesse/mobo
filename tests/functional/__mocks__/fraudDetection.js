module.exports = {
  checkFraud:         jest.fn().mockResolvedValue({ is_fraud: false, score: 0.01 }),
  checkPaymentFraud:  jest.fn().mockResolvedValue({ flagged: false, verdict: 'allow', score: 0.01 }),
  checkRideFraud:     jest.fn().mockResolvedValue({ flagged: false, verdict: 'allow', score: 0.01 }),
};
