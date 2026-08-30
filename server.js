const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. MongoDB Atlas Connection
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log("Connected to MongoDB Atlas for CEP Campus Care 🚀"))
    .catch(err => console.error("MongoDB Connection Error:", err));

// 2. Nodemailer Transporter Config
const EMAIL_USER = 'cepcampuscare.test@gmail.com'; 
const EMAIL_PASS = 'oylmjolovjmqyenc'; 

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

async function sendMatchAlertEmail(toEmail, userPostTitle, matchedPostTitle, matchedLocation, matchedEmail) {
    try {
        const mailOptions = {
            from: `"CEP Campus Care" <${EMAIL_USER}>`,
            to: toEmail,
            subject: '🔍 Potential Match Found - CEP Campus Care',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <h2 style="color: #0d6efd;">CEPians Campus Care - Potential Match!</h2>
                    <p>Hello,</p>
                    <p>Good news! A new listing matching your item/request <strong>"${userPostTitle}"</strong> was just posted on Campus Care.</p>
                    <hr>
                    <h4>Matched Item Details:</h4>
                    <ul>
                        <li><strong>Item Title:</strong> ${matchedPostTitle}</li>
                        <li><strong>Location:</strong> ${matchedLocation}</li>
                        <li><strong>Contact Email:</strong> ${matchedEmail}</li>
                    </ul>
                    <p>Please check the portal or contact the student via email to verify.</p>
                    <p style="color: #888; font-size: 12px; margin-top: 20px;">CEPians Campus Care Student Support System</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`Auto-Match email sent successfully to ${toEmail}`);
    } catch (err) {
        console.error("Failed to send match email:", err);
    }
}

// 3. Database Schema
const itemSchema = new mongoose.Schema({
    type: { type: String, required: true }, 
    intent: { type: String, required: true }, 
    title: { type: String, required: true },
    brand: String,
    color: String,
    location: { type: String, required: true },
    email: { type: String, required: true },
    imageUrl: String,
    description: String,
    postedBy: String,
    rollNo: String,
    passcode: { type: String },
    reportsCount: { type: Number, default: 0 },
    isFlagged: { type: Boolean, default: false },
    status: { type: String, default: 'Active' },
    createdAt: { type: Date, default: Date.now }
});

const Item = mongoose.model('Item', itemSchema);

// API 1: Fetch All Active Items
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find({ status: 'Active', isFlagged: false }).sort({ createdAt: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch items" });
    }
});

// API 2: Create Post with Passcode (Karma calculation moved to Handover stage)
app.post('/api/items', async (req, res) => {
    try {
        const { type, intent, title, brand, color, location, email, imageUrl, description, postedBy, rollNo } = req.body;

        if (!title || title.trim().length < 3) {
            return res.status(400).json({ error: "Please enter a valid title (at least 3 letters)." });
        }

        const generatedPasscode = Math.floor(1000 + Math.random() * 9000).toString();

        const newItem = new Item({
            type,
            intent,
            title: title.trim(),
            brand,
            color,
            location: location.trim(),
            email: email.trim(),
            imageUrl,
            description: description ? description.trim() : '',
            postedBy,
            rollNo: rollNo ? rollNo.toUpperCase() : '',
            passcode: generatedPasscode,
            status: 'Active'
        });

        await newItem.save();

        // Confirmation Mail Sending
        const confirmMailOptions = {
            from: `"CEP Campus Care" <${EMAIL_USER}>`,
            to: newItem.email,
            subject: '✅ Post Confirmation - CEP Campus Care',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <h3 style="color: #0d6efd;">Hi ${newItem.postedBy || 'Student'},</h3>
                    <p>Your post <strong>"${newItem.title}"</strong> has been successfully published on CEP Campus Care portal.</p>
                    <p><strong>Claim Passcode:</strong> <span style="font-size: 18px; font-weight: bold; color: #d97706;">${newItem.passcode}</span></p>
                    <p>Keep this passcode safe and provide it to the student when handing over the item.</p>
                    <hr>
                    <p style="color: #888; font-size: 12px;">Thank you for contributing to our campus community!</p>
                </div>
            `
        };
        transporter.sendMail(confirmMailOptions).catch(err => console.log("Confirmation Email Error:", err));

        // Smart Matching Logic (Lost/Found & Offer/Request)
        let matchQuery = {
            _id: { $ne: newItem._id },
            status: 'Active'
        };

        if (newItem.type === 'Lost') {
            matchQuery.type = 'Found';
        } else if (newItem.type === 'Found') {
            matchQuery.type = 'Lost';
        } else {
            matchQuery.type = newItem.type;
            matchQuery.intent = newItem.intent === 'Offer' ? 'Request' : 'Offer';
        }

        const keywords = newItem.title.trim().split(' ').filter(w => w.length > 2);
        matchQuery.$or = [
            { title: { $regex: keywords.join('|'), $options: 'i' } },
            { location: { $regex: newItem.location, $options: 'i' } }
        ];

        const matches = await Item.find(matchQuery);

        if (matches.length > 0) {
            const matchedItem = matches[0];
            sendMatchAlertEmail(newItem.email, newItem.title, matchedItem.title, matchedItem.location, matchedItem.email);
            sendMatchAlertEmail(matchedItem.email, matchedItem.title, newItem.title, newItem.location, newItem.email);
        }

        res.json({
            message: "Item created successfully",
            item: newItem
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to save item to database" });
    }
});

// API 3: Claim / Handover Item using Passcode (Auto Hide Related Listings)
app.post('/api/items/:id/claim', async (req, res) => {
    try {
        const { passcode } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Post not found" });

        const storedPasscode = String(item.passcode).trim();
        const enteredPasscode = String(passcode).trim();

        if (storedPasscode !== enteredPasscode) {
            return res.status(400).json({ error: "Invalid Passcode! Verification failed." });
        }

        item.status = 'HandedOver';
        await item.save();

        const titleRegex = new RegExp("^" + item.title.trim() + "$", "i");
        await Item.updateMany(
            { 
                title: { $regex: titleRegex },
                status: 'Active'
            },
            { $set: { status: 'HandedOver' } }
        );

        res.json({ message: "Passcode verified! Item successfully handed over and related listings closed." });
    } catch (err) {
        console.error("Claim error:", err);
        res.status(500).json({ error: "Claim verification failed" });
    }
});

// API 4: Mark Item as Resolved
app.patch('/api/items/:id/resolve', async (req, res) => {
    try {
        const { rollNo } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Post not found" });

        if (item.rollNo && item.rollNo !== rollNo?.toUpperCase()) {
            return res.status(403).json({ error: "Unauthorized! Only post owner can resolve this." });
        }

        item.status = 'Resolved';
        await item.save();

        res.json({ message: "Post marked as resolved! It is now hidden from the feed." });
    } catch (err) {
        res.status(500).json({ error: "Failed to resolve post" });
    }
});

// API 5: Delete Post Completely (Strict Owner Verification)
app.delete('/api/items/:id', async (req, res) => {
    try {
        const { rollNo, email, postedBy } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Post not found" });

        const isOwnerByRoll = item.rollNo && rollNo && item.rollNo.toUpperCase() === rollNo.toUpperCase();
        const isOwnerByEmail = item.email && email && item.email.toLowerCase() === email.toLowerCase();
        const isOwnerByName = item.postedBy && postedBy && item.postedBy.toLowerCase() === postedBy.toLowerCase();

        if (!isOwnerByRoll && !isOwnerByEmail && !isOwnerByName) {
            return res.status(403).json({ error: "Unauthorized! You can only delete your own posts." });
        }

        await Item.findByIdAndDelete(req.params.id);
        res.json({ message: "Post deleted successfully!" });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ error: "Failed to delete post" });
    }
});

// API 6: Report Post
app.post('/api/items/:id/report', async (req, res) => {
    try {
        const { userRollNo } = req.body;
        const item = await Item.findById(req.params.id);
        
        if (!item) return res.status(404).json({ error: "Post not found" });

        if (item.rollNo && item.rollNo === userRollNo?.toUpperCase()) {
            return res.status(400).json({ error: "You cannot report your own post!" });
        }

        item.reportsCount = (item.reportsCount || 0) + 1;
        
        if (item.reportsCount >= 5) {
            item.isFlagged = true;
        }

        await item.save();
        res.json({ message: "Report submitted. Thank you for keeping campus safe!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to report post" });
    }
});

// API 7: Manual Match Search Route
app.get('/api/items/:id/matches', async (req, res) => {
    try {
        const currentItem = await Item.findById(req.params.id);
        if (!currentItem) return res.status(404).json({ error: "Item not found" });

        let matchQuery = {
            _id: { $ne: currentItem._id },
            status: 'Active'
        };

        if (currentItem.type === 'Lost') {
            matchQuery.type = 'Found';
        } else if (currentItem.type === 'Found') {
            matchQuery.type = 'Lost';
        } else {
            matchQuery.type = currentItem.type;
            matchQuery.intent = currentItem.intent === 'Offer' ? 'Request' : 'Offer';
        }

        const titleKeywords = currentItem.title.split(' ').filter(w => w.length > 2);
        matchQuery.$or = [
            { title: { $regex: titleKeywords.join('|'), $options: 'i' } },
            { location: { $regex: currentItem.location, $options: 'i' } }
        ];

        const matches = await Item.find(matchQuery).limit(3);

        res.json({ matchesCount: matches.length, matches });
    } catch (err) {
        res.status(500).json({ error: "Match search failed" });
    }
});

// API 8: Fetch Total Karma Points (Calculated ONLY for successfully HandedOver Items)
app.get('/api/users/:rollNo/karma', async (req, res) => {
    try {
        const userRollNo = req.params.rollNo.toUpperCase();
        
        // വിജയകരമായി HandedOver ആയതും, Found അല്ലെങ്കിൽ Offer ആയതുമായ പോസ്റ്റുകൾ മാത്രം കണക്കിലെടുക്കുന്നു
        const userCompletedPosts = await Item.find({ 
            rollNo: userRollNo, 
            status: 'HandedOver',
            $or: [
                { type: 'Found' },
                { type: 'Skill', intent: 'Offer' },
                { type: 'Resource', intent: 'Offer' }
            ]
        });

        let totalKarma = 0;
        const postsByDate = {};

        userCompletedPosts.forEach(post => {
            const dateKey = new Date(post.createdAt).toISOString().split('T')[0];
            postsByDate[dateKey] = (postsByDate[dateKey] || 0) + 1;
            
            // ഒരു ദിവസം പരമാവധി 3 വിജയകരമായ കൈമാറ്റങ്ങൾക്ക് മാത്രം Karma (ദിവസവും പരമാവധി 15 points)
            if (postsByDate[dateKey] <= 3) {
                totalKarma += 5;
            }
        });

        res.json({ rollNo: userRollNo, karmaPoints: totalKarma });
    } catch (err) {
        res.status(500).json({ error: "Failed to calculate karma" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
