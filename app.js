// app.js
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
//const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');


dotenv.config();

const app = express();
app.use(express.json());

// 用户数据文件路径
const usersFilePath = path.join(__dirname, 'users.json');
// 确保用户数据文件存在
if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify([])); // 初始化为空数组
}

// 注册
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFilePath));
    const existingUser = users.find(user => user.username === username);

    if (existingUser) {
        return res.status(400).json({ error: '用户已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    res.status(201).json({ message: '用户注册成功' });
});

// 登录
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFilePath));
    const user = users.find(user => user.username === username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: '无效的用户名或密码' });
    }

    const token = jwt.sign({ username }, 'your_jwt_secret', { expiresIn: '1h' });
    res.json({ token });
});

// 中间件：验证 JWT
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Bearer token
    console.log('Received Token:', token); // 打印接收到的 token
    if (!token) return res.sendStatus(401);
    jwt.verify(token, 'your_jwt_secret', (err) => {
        if (err) {
            console.error('Token verification failed:', err);
            return res.sendStatus(403);
        }
        next();
    });
};

app.post('/api/search-images-all', authenticateToken, async (req, res) => {
    const query = req.body.query;
    if (!query) {
        return res.status(400).json({ error: 'Search keyword cannot be null' });
    }

    try {
        // 使用 Promise.all 同时从 Unsplash 和 Pixabay 获取图像
        const [unsplashResponse, pixabayResponse] = await Promise.all([
            axios.get('https://api.unsplash.com/search/photos', {
                params: {
                    query: query,
                    client_id: process.env.UNSPLASH_ACCESS_KEY // Get API KEY from .env 
                }
            }).catch(err => {
                console.error('Unsplash  requst Failed:', err.message);
                return { data: { results: [] } }; // Default return null
            }),

            axios.get('https://pixabay.com/api/', {
                params: {
                    key: process.env.PIXABAY_API_KEY, // Get API KEY from .env 
                    q: query
                }
            }).catch(err => {
                console.error('Pixabay requst Failed:', err.message);
                return { data: { hits: [] } }; // Default return null
            })
        ]);

        const unsplashResults = unsplashResponse?.data.results || []; // 从 Unsplash 获取的结果，默认为空数组
        const pixabayResults = pixabayResponse?.data.hits || []; // 从 Pixabay 获取的结果，默认为空数组

        // 合并结果
        const results = [...unsplashResults, ...pixabayResults];
        // 检查合并后的结果是否为空
        if (results.length === 0) {
            return res.status(404).json({ error: 'Cannot find images' });
        }

        // 返回合并后的结果
        return res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Exceptions when finding images' });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`服务器正在运行，端口: ${PORT}`);
});