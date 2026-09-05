const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// MongoDB Connection String
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://fathimasuni25_db_user:Xg84eUcvKK4hAHtR@cluster0.9yeaire.mongodb.net/cepians_care?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to CEP MongoDB Database successfully!'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// ================= NODEMAILER EMAIL TRANSPORTER =================
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4, // Forces IPv4 to fix Render connection timeouts (ENETUNREACH)
    auth: {
        user: process.env.EMAIL_USER || 'cepcampuscare.test@gmail.com',
        pass: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, '') : 'oylmjolovjmqyenc'
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Helper to send email notification
async function sendMatchEmail(toEmail, userPost, matchedPost) {
    if (!toEmail) return;
    
    const mailOptions = {
        from: `"CEPians Campus Care" <${process.env.EMAIL_USER || 'cepcampuscare.test@gmail.com'}>`,
        to: toEmail,
        subject: `🔔 Match Alert: Your CEP Listing (${userPost.title})`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                <h2 style="color: #0d6efd;">CEPians Campus Care Alert!</h2>
                <p>Hello <strong>${userPost.postedBy}</strong>,</p>
                <p>We found a potential match on the campus feed for your item: <strong>"${userPost.title}"</strong>!</p>
                <hr/>
                <h3>Matched Item Details:</h3>
                <ul>
                    <li><strong>Item Title:</strong> ${matchedPost.title}</li>
                    <li><strong>Category:</strong> ${matchedPost.type} (${matchedPost.intent})</li>
                    <li><strong>Location:</strong> ${matchedPost.location}</li>
                    <li><strong>Posted By:</strong> ${matchedPost.postedBy}</li>
                    <li><strong>Contact Email:</strong> <a href="mailto:${matchedPost.email}">${matchedPost.email}</a></li>
                </ul>
                <p>Please connect with them to verify your item.</p>
                <br>
                <p style="font-size: 12px; color: #777;">College of Engineering Perumon - Student Support Portal</p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Notification Email sent successfully to ${toEmail}:`, info.response);
    } catch (error) {
        console.error("❌ Email Sending Error:", error);
    }
}

// Smart Auto-Matching Engine Logic
async function findAndNotifyMatches(newItem) {
    try {
        const targetType = newItem.type === 'Lost' ? 'Found' : (newItem.type === 'Found' ? 'Lost' : null);
        if (!targetType) return null;

        // Extract key search terms (filtering out small words)
        const searchWords = newItem.title
            .trim()
            .split(/\s+/)
            .filter(word => word.length > 2);

        if (searchWords.length === 0) return null;

        const regexPattern = searchWords.join('|');

        const matches = await Item.find({
            _id: { $ne: newItem._id },
            isResolved: { $ne: true },
            type: targetType,
            title: { $regex: regexPattern, $options: 'i' }
        }).sort({ createdAt: -1 }).limit(3);

        if (matches.length > 0) {
            const matchedPost = matches[0];

            // Link items in database
            newItem.matchedWith = matchedPost._id;
            await newItem.save();

            matchedPost.matchedWith = newItem._id;
            await matchedPost.save();

            console.log(`✨ Match found between "${newItem.title}" and "${matchedPost.title}"`);

            // Trigger notification emails
            await sendMatchEmail(newItem.email, newItem, matchedPost);
            await sendMatchEmail(matchedPost.email, matchedPost, newItem);
            
            return matchedPost;
        }
    } catch (err) {
        console.error("❌ Auto Match Logic Error:", err);
    }
    return null;
}

// Helper Badge logic
function getBadge(points) {
    if (points >= 200) return { title: 'CEP Legend 🌟', level: 'Legend' };
    if (points >= 100) return { title: 'CEP Champion 🏆', level: 'Champion' };
    if (points >= 50)  return { title: 'CEP Helper 🤝', level: 'Helper' };
    return { title: 'CEpian Contributor 🌱', level: 'Contributor' };
}

// ================= SCHEMAS & MODELS =================

const ItemSchema = new mongoose.Schema({
    type: { type: String, required: true },
    intent: { type: String, required: true },
    title: { type: String, required: true },
    brand: { type: String, default: '' },
    color: { type: String, default: '' },
    location: { type: String, required: true },
    email: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    description: { type: String, default: '' },
    postedBy: { type: String, required: true },
    rollNo: { type: String, required: true },
    passcode: { 
        type: String, 
        default: () => Math.floor(1000 + Math.random() * 9000).toString() 
    },
    matchedWith: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    isFlagged: { type: Boolean, default: false },
    isResolved: { type: Boolean, default: false },
    reports: [String],
    createdAt: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
    rollNo: { type: String, unique: true, required: true },
    karmaPoints: { type: Number, default: 0 }
});

const Item = mongoose.model('Item', ItemSchema);
const User = mongoose.model('User', UserSchema);

// ================= API ROUTES =================

// 1. Get all active listings
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find({ isResolved: { $ne: true } }).sort({ createdAt: -1 });
        res.json(items);
    } catch (err) {
        console.error("Error fetching items:", err);
        res.status(500).json({ error: "Failed to fetch listings" });
    }
});

// 2. Post a new item/request (NOW AUTOMATICALLY CHECKS MATCHES & SENDS EMAILS)
app.post('/api/items', async (req, res) => {
    try {
        const itemData = req.body;
        if (itemData.rollNo) {
            itemData.rollNo = itemData.rollNo.toUpperCase();
        }

        const newItem = new Item(itemData);
        await newItem.save();

        // Run matching immediately in background
        const matchedItem = await findAndNotifyMatches(newItem);

        res.status(201).json({ 
            item: newItem, 
            matchedWith: matchedItem,
            earnedKarma: 0 
        });
    } catch (err) {
        console.error("Error creating item:", err);
        res.status(500).json({ error: "Failed to save post." });
    }
});

// 3. MANUAL AUTO MATCH ROUTE (FOR RETRYING MATCHES)
app.get('/api/items/:id/matches', async (req, res) => {
    try {
        const currentItem = await Item.findById(req.params.id);
        if (!currentItem) return res.status(404).json({ error: "Item not found" });

        const matchedPost = await findAndNotifyMatches(currentItem);

        res.json({
            matchesCount: matchedPost ? 1 : 0,
            matches: matchedPost ? [matchedPost] : []
        });
    } catch (err) {
        console.error("Auto match error:", err);
        res.status(500).json({ error: "Failed to search matches" });
    }
});

// 4. Claim item (Marks BOTH matched items as RESOLVED so they DISAPPEAR)
app.post('/api/items/:id/claim', async (req, res) => {
    try {
        const { passcode } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Item not found" });

        if (item.passcode === passcode) {
            item.isResolved = true;
            await item.save();

            // Matched item ഉണ്ടെങ്കിൽ അതും Auto-Resolve ആക്കും (Feed-ൽ നിന്ന് Disappear ആകും)
            if (item.matchedWith) {
                await Item.findByIdAndUpdate(item.matchedWith, { isResolved: true });
            }

            let earnedKarma = 0;
            let currentPoints = 0;
            let currentBadge = getBadge(0).title;

            if ((item.intent === 'Offer' || item.type === 'Found') && item.rollNo) {
                const helperRoll = item.rollNo.toUpperCase();
                let user = await User.findOne({ rollNo: helperRoll });

                earnedKarma = 3;

                if (!user) {
                    user = new User({ rollNo: helperRoll, karmaPoints: earnedKarma });
                } else {
                    user.karmaPoints += earnedKarma;
                }
                await user.save();

                currentPoints = user.karmaPoints;
                currentBadge = getBadge(currentPoints).title;
            }

            res.json({ 
                message: "Handover verified! Both items marked as resolved.",
                earnedKarma: earnedKarma,
                totalKarma: currentPoints,
                badge: currentBadge
            });
        } else {
            res.status(400).json({ error: "Incorrect passcode entered!" });
        }
    } catch (err) {
        console.error("Claim error:", err);
        res.status(500).json({ error: "Server error during verification" });
    }
});

// 5. User Karma Details
app.get('/api/users/:rollNo/karma', async (req, res) => {
    try {
        const formattedRoll = req.params.rollNo.toUpperCase();
        const user = await User.findOne({ rollNo: formattedRoll });
        const points = user ? user.karmaPoints : 0;
        const badge = getBadge(points);

        res.json({ 
            rollNo: formattedRoll,
            karmaPoints: points, 
            badge: badge.title,
            level: badge.level
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch karma points" });
    }
});

// 6. Report fake post
app.post('/api/items/:id/report', async (req, res) => {
    try {
        const { userRollNo } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Item not found" });

        const formattedRoll = userRollNo ? userRollNo.toUpperCase() : 'ANONYMOUS';

        if (!item.reports.includes(formattedRoll)) {
            item.reports.push(formattedRoll);
            if (item.reports.length >= 2) {
                item.isFlagged = true;
            }
            await item.save();
            res.json({ message: "Post reported successfully." });
        } else {
            res.status(400).json({ error: "You have already reported this post." });
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to report post" });
    }
});

// 7. Resolve single post manually
app.patch('/api/items/:id/resolve', async (req, res) => {
    try {
        const { rollNo } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Item not found" });

        if (rollNo && item.rollNo.toUpperCase() === rollNo.toUpperCase()) {
            item.isResolved = true;
            await item.save();

            // Matched Item ഉണ്ടെങ്കിൽ അതും Disappear ചെയ്യും
            if (item.matchedWith) {
                await Item.findByIdAndUpdate(item.matchedWith, { isResolved: true });
            }

            res.json({ message: "Post marked as resolved successfully." });
        } else {
            res.status(403).json({ error: "Unauthorized: Only the owner can resolve this post." });
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to resolve post" });
    }
});

// 8. Delete post
app.delete('/api/items/:id', async (req, res) => {
    try {
        const { rollNo } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Item not found" });

        if (rollNo && item.rollNo.toUpperCase() === rollNo.toUpperCase()) {
            await Item.findByIdAndDelete(req.params.id);
            res.json({ message: "Post deleted successfully." });
        } else {
            res.status(403).json({ error: "Unauthorized: Only owner can delete this post." });
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to delete post" });
    }
});

// Fallback Middleware
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 CEpians Campus Care Server running on port ${PORT}`);
});
