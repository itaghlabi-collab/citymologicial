/**
 * Simple request validation middleware factory.
 * Usage: validate(['field1','field2']) as Express middleware.
 */
function validate(requiredFields) {
  return (req, res, next) => {
    const missing = requiredFields.filter(f => {
      const val = req.body[f];
      return val === undefined || val === null || val === '';
    });
    if (missing.length > 0) {
      return res.status(400).json({ error: `Champs obligatoires manquants: ${missing.join(', ')}` });
    }
    next();
  };
}

module.exports = { validate };
