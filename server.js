require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path")
const multer = require("multer");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use("/uploads", express.static("uploads"));


// เชื่อมต่อ PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

// ตรวจสอบการเชื่อมต่อ
pool.connect((err) => {
  if (err) {
    console.error("❌ Database connection error", err.stack);
  } else {
    console.log("✅ Connected to PostgreSQL");
  }
});

app.post("/register", async (req, res) => {
  const { user_name, user_pass, user_email } = req.body;
  console.log("Received Data:", req.body);
  
  // ตรวจสอบว่าผู้ใช้กรอกข้อมูลครบถ้วนหรือไม่
  if (!user_name || !user_pass || !user_email) {
    return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }

  try {
    // ตรวจสอบว่า username หรือ email ซ้ำหรือไม่
    const checkUserQuery = 'SELECT * FROM userinfo WHERE user_name = $1 OR user_email = $2';
    const result = await pool.query(checkUserQuery, [user_name, user_email]);

    // ถ้าพบข้อมูลที่ซ้ำกัน
    if (result.rows.length > 0) {
      const errorMessage = result.rows[0].user_name === user_name 
        ? 'ชื่อผู้ใช้งานนี้มีผู้ใช้งานแล้ว' 
        : 'อีเมลนี้มีผู้ใช้งานแล้ว';
      return res.status(400).json({ message: errorMessage });
    }

    // เข้ารหัสรหัสผ่านด้วย bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(user_pass, saltRounds);

    // เพิ่มข้อมูลสมาชิกใหม่ลงในฐานข้อมูล
    const insertQuery = "INSERT INTO userinfo (user_name, user_pass, user_email) VALUES ($1, $2, $3) RETURNING *";
    const insertResult = await pool.query(insertQuery, [user_name, hashedPassword, user_email]);

    res.status(201).json({ message: "สมัครสมาชิกสำเร็จ!", user: insertResult.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดในการสมัครสมาชิก" });
  }
});

// let gloResults = null;
// let userid = null;

let userid = null;

app.use(session({
  secret: process.env.SECRET_KEY, // รหัสลับสำหรับการเข้ารหัส session
  resave: false,             // ไม่บันทึก session หากไม่มีการเปลี่ยนแปลง
  saveUninitialized: true,   // บันทึก session ใหม่ๆ แม้ว่ายังไม่มีข้อมูล
  cookie: { secure: false }  // ใช้ secure: true เมื่อใช้งาน HTTPS
}));

app.post("/login", async (req, res) => {
  const { user_name, user_pass } = req.body;
  console.log("Received Data:", req.body);

  if (!user_name || !user_pass) {
    return res.status(400).json({ message: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" });
  }

  try {
    const result = await pool.query("SELECT * FROM userinfo WHERE user_name = $1", [user_name]);

    if (result.rows.length > 0) {
      const user = result.rows[0];

      //เปรียบเทียบรหัสผ่านที่เข้ารหัส
      const isMatch = await bcrypt.compare(user_pass, user.user_pass); // ⬅️ ใช้ `user.user_pass`

      if (isMatch) {
        // เก็บ user_id ใน session
        
        req.session.userId = user.user_id;
        userid = req.session.userId;
        console.log("User_id:", req.session.userId);
        console.log("userid:", userid);
        // ส่ง response กลับไปพร้อมข้อมูล
        res.status(200).json({ message: "เข้าสู่ระบบสำเร็จ!", user });
      } else {
        res.status(401).json({ message: "รหัสผ่านไม่ถูกต้อง" });
      }
    } else {
      res.status(401).json({ message: "ไม่พบผู้ใช้งานนี้" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" });
  }
});

//ดึวข้อมูลผู้ใช้งาน
app.get('/user', async (req, res) => {
  try {
      const userId = userid;
      console.log("get user",userId);
      const result = await pool.query('SELECT user_name, user_email FROM userinfo WHERE user_id = $1', [userId]);
      
      if (result.rows.length > 0) {
          res.json(result.rows[0]);
      } else {
          res.status(404).json({ error: "User not found" });
      }
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error" });
  }
});

//เปลี่ยนรหัสผ่าน
app.post('/change-password', async (req, res) => {
  const userId = userid;
  const { user_pass } = req.body;
  console.log(userId);
  console.log(req.body);
  if (!userId||!user_pass) {
    return res.status(400).json({ message: 'User ID และรหัสผ่านใหม่เป็นข้อมูลที่จำเป็น' });
  }

  try {
    // ใช้ bcrypt เข้ารหัสรหัสผ่านใหม่
    const hashedPassword = await bcrypt.hash(user_pass, 10);
    console.log(hashedPassword);
    // อัปเดตรหัสผ่านในฐานข้อมูล
    const result = await pool.query(
      'UPDATE userinfo SET user_pass = $1 WHERE user_id = $2 ', [hashedPassword, userId]
    );
    console.log(result);
    
    if (user_pass.length > 0) {
      res.status(200).json({ message: 'รหัสผ่านถูกเปลี่ยนเรียบร้อยแล้ว' });
      console.log('รหัสผ่านถูกเปลี่ยนเรียบร้อยแล้ว');
    } else {
      res.status(404).json({ message: 'ไม่พบผู้ใช้ที่ระบุ' });
      console.log('ไม่พบผู้ใช้ที่ระบุ');
    }
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
    console.log('เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน');
  }
});

// ลบบัญชีผู้ใช้
app.post('/delete-account', async (req, res) => {
  const  userId  = userid;
  const { de } = req.body;
  console.log(req.body);
  if (!userId) {
    return res.status(400).json({ message: 'ข้อมูล userId เป็นข้อมูลที่จำเป็น' });
  }

  try {
    // ลบบัญชีผู้ใช้จากฐานข้อมูล
    if(de === 1){
      const result = await pool.query(
      'DELETE FROM userinfo WHERE user_id = $1', [userId]
    )
    
    

    if (result.rowCount > 0) {
      res.status(200).json({ message: 'บัญชีถูกลบเรียบร้อยแล้ว' });
    } else {
      res.status(404).json({ message: 'ไม่พบผู้ใช้ที่ระบุ' });
    }
    }
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบบัญชี' });
  }
});

// ✅ ดึง "รายการนิยายโปรด" ของผู้ใช้
app.get("/favorites/:novel_id", async (req, res) => {
  try {
    const user_id = userid; // ✅ ดึงจาก Token หรือ Session
    const { novel_id } = req.params;

    if (!user_id || !novel_id) {
      return res.status(400).json({ error: "user_id and novel_id are required" });
    }

    const result = await pool.query(
      "SELECT * FROM lastet_novel WHERE user_id = $1 AND novel_id = $2",
      [user_id, novel_id]
    );

    res.json({ isFavorite: result.rowCount > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ เพิ่ม "นิยายโปรด" ของผู้ใช้
app.post("/favorites", async (req, res) => {
  const { novel_id } = req.body;
  const user_id = userid
  console.log("novel_id post:", req.body);
  if (!user_id || !novel_id) {
    return res.status(400).json({ error: "user_id and novel_id are required" });
  }

  try {
    await pool.query(
      "INSERT INTO lastet_novel (user_id, novel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [user_id, novel_id]
    );
    res.status(201).json({ message: "Added to favorites" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ ลบ "นิยายโปรด" ของผู้ใช้
app.delete("/favorites/:novel_id", async (req, res) => {
  try {
    const user_id = userid;
    const { novel_id } = req.params;

    if (!user_id || !novel_id) {
      return res.status(400).json({ error: "user_id and novel_id are required" });
    }

    const result = await pool.query(
      "DELETE FROM lastet_novel WHERE user_id = $1 AND novel_id = $2 RETURNING *",
      [user_id, novel_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Favorite not found" });
    }

    res.json({ message: "Removed from favorites" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ ดึง "รายการนิยายโปรด" ของผู้ใช้
app.get("/favoritess", async (req, res) => {
    const user_id = userid;  // รับค่า user_id จาก query parameter
    if (!user_id) return res.status(400).json({ error: "user_id is required" });

    try {
        const result = await pool.query(
            `SELECT lastet_novel.user_id, novel.novel_id, novel.novel_name, novel.novel_type_id, novel.novel_img, novel.novel_penname,noveltype.novel_type_name
              FROM lastet_novel 
              INNER JOIN novel 
              ON lastet_novel.novel_id = novel.novel_id 
              INNER JOIN noveltype 
              ON noveltype.novel_type_id = novel.novel_type_id 
              WHERE lastet_novel.user_id = $1`, [user_id]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// API ดึง
app.get("/novels", async (req, res) => {
  try {
    const result = await pool.query("SELECT novel.novel_id,novel.novel_penname,noveltype.novel_type_id,novel.novel_name,novel.novel_img,noveltype.novel_type_name FROM novel INNER JOIN noveltype ON novel.novel_type_id = noveltype.novel_type_id");
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.get("/novel", async (req, res) => {
  const user_id = userid;
  try {
    const result = await pool.query("SELECT * FROM public.userinfo INNER JOIN public.novel ON userinfo.user_id = novel.user_id INNER JOIN noveltype ON noveltype.novel_type_id = novel.novel_type_id WHERE userinfo.user_id = $1;",[user_id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// API เพิ่ม novel
// app.post('/novel', async (req, res) => {
//   const { novel_name, novel_type_id, novel_img, novel_penname, user_id } = req.body;
  
//   console.log("Received Data:", req.body); //  ตรวจสอบค่าที่ได้รับ

//   try {
//       //  แปลง `novel_type_id` เป็น `int` ถ้ามาเป็น string
//       const genreId = Array.isArray(novel_type_id) 
//           ? novel_type_id.map(Number) 
//           : [Number(novel_type_id)];

//       console.log("Parsed novel_type_id:", genreId); // ตรวจสอบค่าหลังแปลง

//       const sql = 'INSERT INTO novel (novel_name, novel_type_id, novel_img, novel_penname, user_id) VALUES ($1, $2, $3, $4, $5);';
//       const result = await pool.query(sql, [novel_name, genreId[0], novel_img, novel_penname, user_id]);

//       res.status(200).json(result.rows[0]);
//   } catch (error) {
//       console.error("Database Error:", error);
//       res.status(500).send('Server error');
//   }
// });


const uploadDir = './uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// ตั้งค่า Multer ให้เก็บไฟล์ที่ `uploads/`
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/'); // ระบุโฟลเดอร์ปลายทาง
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // ตั้งชื่อไฟล์ใหม่
    }
});
const upload = multer({ storage });

// // Middleware เพื่อให้เข้าถึงไฟล์รูปผ่าน URL ได้
app.use('/uploads', express.static('uploads'));

// ✅ API อัปโหลด Novel
app.post("/novel", upload.single("novel_img"), async (req, res) => {
  console.log("Received Data:", req.body);
  console.log("userid:", userid);
  if (!userid) {
    return res.status(401).json({ error: "กรุณาล็อกอินก่อน!" });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded!" });
    }
    
    const { novel_name, novel_type_id, novel_penname } = req.body;
    const novel_img = req.file.filename;
    const user_id = userid; // ✅ ดึง user_id จาก session

    const sql =
      "INSERT INTO novel (novel_name, novel_type_id, novel_img, novel_penname, user_id) VALUES ($1, $2, $3, $4, $5)";
    await pool.query(sql, [novel_name, novel_type_id, novel_img, novel_penname, user_id]);

    res.status(200).json({ message: "Novel added successfully!", novel_img });
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).send("Server error");
  }
});


// API สำหรับเพิ่มข้อมูลนิยาย
app.post("/addnovel", async (req, res) => {
  try {
    const { novel_id, chap_write, novel_num } = req.body;
    console.log("Received Data:", req.body);
    if (!novel_id || !novel_num) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    const result = await pool.query(
      "INSERT INTO chapter (novel_id, chap_write, chap_num) VALUES ($1, $2, $3) RETURNING *",[novel_id, chap_write, novel_num]
    );

    res.status(200).json({ message: "บันทึกข้อมูลสำเร็จ", novel: result.rows[0] });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
  }
});

app.get("/novels/:novel_id", async (req, res) => {
  try {
    const { novel_id } = req.params;
    const result = await pool.query("SELECT chap_num, chap_write FROM chapter WHERE novel_id = $1", [novel_id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการโหลดข้อมูล" });
  }
});

app.get("/novels/:novelId", async (req, res) => {
  try {
    const { novelId } = req.params;
    const result = await pool.query(
      "SELECT * FROM chapter WHERE novel_id = $1 ORDER BY chap_num",[novelId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get('/comment/:novelId', async (req, res) => {
  const { novelId } = req.params;
  
  try {
    const result = await pool.query('SELECT * FROM public.comment INNER JOIN userinfo ON  userinfo.user_id = comment.user_id WHERE novel_id = $1', [novelId]);
    res.json(result.rows); // Send the list of comments as response
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).send('Error fetching comments');
  }
});

// Endpoint to post a new comment
app.post('/comment', async (req, res) => {
  const { novel_id, com_text } = req.body;
  const user_id = userid; // Default author name if not provided
  console.log(req.body);
  try {
    const result = await pool.query(
      'INSERT INTO comment (novel_id, com_text, user_id) VALUES ($1, $2, $3) RETURNING *',
      [novel_id, com_text, user_id]
    );
    res.status(201).json(result.rows[0]); // Return the newly created comment
  } catch (err) {
    console.error('Error posting comment:', err);
    res.status(500).send('Error posting comment');
  }
});


// เริ่มเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
