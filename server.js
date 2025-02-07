require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path")
const multer = require("multer");
const bcrypt = require("bcrypt");

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
        res.status(200).json({ message: "เข้าสู่ระบบสำเร็จ!", user });
        //gloResults = result;
        //userid = result[0].user_id;
        // console.log("Received Data:", userid);
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






// API ดึงข้อมูลผู้ใช้ทั้งหมด
app.get("/novel", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.novel ORDER BY novel_id ASC ");
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
app.post('/novel', upload.single('novel_img'), async (req, res) => {
  console.log("Received Data:", req.body);
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded!" });
        }

        const { novel_name, novel_type_id, novel_penname, user_id } = req.body;
        const novel_img = req.file.filename; // 👉 เก็บแค่ชื่อไฟล์

        const sql = 'INSERT INTO novel (novel_name, novel_type_id, novel_img, novel_penname, user_id) VALUES ($1, $2, $3, $4, $5)';
        await pool.query(sql, [novel_name, novel_type_id, novel_img, novel_penname, user_id]);

        res.status(200).json({ message: "Novel added successfully!", novel_img });
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).send('Server error');
    }
});


// เริ่มเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
