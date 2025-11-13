const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware za JWT autentifikaciju
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Nema tokena, pristup odbijen' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.aktivan) {
      return res.status(401).json({ message: 'Korisnik nije pronađen ili nije aktivan' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Auth greška:', error.message);
    res.status(401).json({ message: 'Token nije valjan' });
  }
};

// Middleware za provjeru role
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Korisnik nije autentificiran' });
    }

    // Ako je proslijeđen string, pretvori u array
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    if (!rolesArray.includes(req.user.uloga)) {
      return res.status(403).json({ message: 'Nemate dozvolu za ovu akciju' });
    }

    next();
  };
};

module.exports = { authenticate: auth, checkRole };
