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
  if (!user_name || !user_pass || !user_email) {
    return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }

  try {
    // เข้ารหัสรหัสผ่านด้วย bcrypt
    const saltRounds = 10; // ระดับความปลอดภัย (10 เป็นค่าที่แนะนำ)
    const hashedPassword  = await bcrypt.hash(user_pass, saltRounds);

    const result = await pool.query(
      "INSERT INTO userinfo (user_name, user_pass , user_email) VALUES ($1, $2, $3) RETURNING *",
      [user_name, hashedPassword , user_email]
    );

    res.status(201).json({ message: "สมัครสมาชิกสำเร็จ!", user: result.rows[0] });
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

      // 🔑 เปรียบเทียบรหัสผ่านที่เข้ารหัส
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
app.get("/favorites", async (req, res) => {
  const user_id = userid;  // ค่าของ user_id จากการยืนยันตัวตน (หรือจาก session/token)
  if (!user_id) return res.status(400).json({ error: "user_id is required" });

  try {
    const result = await pool.query(
      `SELECT lastet_novel.user_id, novel.novel_id, novel.novel_name, novel.novel_type_id, novel.novel_img,novel.novel_penname FROM lastet_novel INNER JOIN novel ON lastet_novel.novel_id = novel.novel_id WHERE lastet_novel.user_id = $1`, [user_id]
    );

    // ส่งข้อมูลรายการโปรดกลับไปยัง Client
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
    const result = await pool.query("SELECT * FROM public.userinfo INNER JOIN public.novel ON userinfo.user_id = novel.user_id WHERE userinfo.user_id = $1;",[user_id]);
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



// เริ่มเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
