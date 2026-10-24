import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
const [email,password]=process.argv.slice(2);
if (!email||!password||password.length<12) throw Error('Uso: npm run seed:admin -- correo@dominio.com CONTRASEÑA_12+');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  await pool.query('INSERT INTO staff_users(email,password_hash,role) VALUES($1,$2,$3)',
    [email.toLowerCase(),await argon2.hash(password,{type:argon2.argon2id}),'admin']);
  console.log('Administrador creado');
} finally {await pool.end();}
