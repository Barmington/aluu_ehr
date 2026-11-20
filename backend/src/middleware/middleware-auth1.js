const jwt=require('jsonwebtoken');
const db=require('../db');
function secret(){if(!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');return process.env.JWT_SECRET;}
async function requireAuth(req,res,next){
  const h=req.headers.authorization||'';
  if(!h.startsWith('Bearer ')) return res.status(401).json({error:'Authentication required'});
  try {
    const p=jwt.verify(h.slice(7),secret());
    const {rows}=await db.query('SELECT id,username,full_name,role,approval_status FROM users WHERE id=$1',[p.sub]);
    const u=rows[0];
    if(!u || u.approval_status!=='approved') return res.status(401).json({error:'Account not active'});
    req.user={id:u.id,username:u.username,role:u.role,fullName:u.full_name};
    next();
  }catch(err){if(err.name==='JsonWebTokenError'||err.name==='TokenExpiredError') return res.status(401).json({error:'Invalid or expired token'});next(err);}
}
function requireRole(...roles){return(req,res,next)=>!req.user||!roles.includes(req.user.role)?res.status(403).json({error:'You do not have permission for this action'}):next();}
function signToken(user){return jwt.sign({sub:user.id,username:user.username,role:user.role,fullName:user.full_name},secret(),{expiresIn:process.env.JWT_EXPIRES_IN||'8h'});}
module.exports={requireAuth,requireRole,signToken};
