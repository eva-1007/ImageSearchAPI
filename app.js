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

// User data file Path
const usersFilePath = path.join(__dirname, 'users.json');
// Ensure user data file exists
if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify([])); //Intiate
}

// Register API
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFilePath));
    const existingUser = users.find(user => user.username === username);

    if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    res.status(201).json({ message: 'User registered successfully' });
});

// Login API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFilePath));
    const user = users.find(user => user.username === username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ username }, 'your_jwt_secret', { expiresIn: '1h' });
    res.json({ token });
});

// Middleware：Authenticate Token  JWT
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Bearer token
    console.log('Received Token:', token); // Print token
    if (!token) return res.sendStatus(401);
    jwt.verify(token, 'your_jwt_secret', (err) => {
        if (err) {
            console.error('Token verification failed:', err);
            return res.sendStatus(403);
        }
        next();
    });
};

//Images search API
app.post('/api/search-images-all', authenticateToken, async (req, res) => {
    const query = req.body.query;
    if (!query) {
        return res.status(400).json({ error: 'Search keyword cannot be null' });
    }

    try {
        // Get images from Promise.all and Unsplash & Pixabay 
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

        //const unsplashResults = unsplashResponse?.data.results || []; // Get images from Unsplash，Default NULL
        //const pixabayResults = pixabayResponse?.data.hits || []; // Get images from Pixabay，Default NULL
        const pixabayResults = pixabayResponse?.data.hits || []; // Get images from Pixabay，Default NULL
        const pixabayResultsMapped = pixabayResults.map(image => {
        return {
            image_ID: image.id,
            thumbnails: "", //
            preview: image.previewURL,
            tags: image.tags.split(',').map(tag => tag.trim()),
            title: image.description, //
            source: "Pixabay" 
        };
        });

        const unsplashResults = unsplashResponse?.data.results || []; // Get images from Unsplash，Default NULL
        const unsplashResultsMapped = unsplashResults.map(image => {
        return {
            image_ID: image.id,
            thumbnails: image.urls.thumb,
            preview: image.urls.small,
            tags: image.tags,
            title: image.description,
            source: "Unsplash"
        };
        });

        // Combine results
        const results = [...pixabayResultsMapped, ...unsplashResultsMapped];
        // Check results is NULL
        if (results.length === 0) {
            return res.status(404).json({ error: 'Cannot find images' });
        }

        // Return results
        return res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Exceptions when finding images' });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});
