let allCampusItems = [];

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('listingsContainer')) {
        fetchListings();
    }
    checkUserLoginStatus();
    setupFilterTabs();
    toggleIntentOptions();
});

// ================= USER SESSION & REWARDS =================

async function checkUserLoginStatus() {
    const user = JSON.parse(localStorage.getItem('cepUser'));

    if (user) {
        const loginBtn = document.getElementById('loginBtn');
        const userBadge = document.getElementById('userBadge');
        const userPoints = document.getElementById('userPoints');
        const userBadgeLevel = document.getElementById('userBadgeLevel');

        try {
            const karmaRes = await fetch(`/api/users/${user.rollNo}/karma`);
            if (karmaRes.ok) {
                const karmaData = await karmaRes.json();
                user.points = karmaData.karmaPoints;
                user.badge = karmaData.badge;
                localStorage.setItem('cepUser', JSON.stringify(user));
            }
        } catch (err) {
            console.error("Failed to fetch user karma points:", err);
        }

        const pts = user.points || 0;

        if (userBadge && userPoints) {
            userPoints.innerText = pts;
            
            if (userBadgeLevel) {
                // Backend Badge Title
                const badgeTitle = user.badge || getFrontendBadgeTitle(pts);
                userBadgeLevel.innerText = badgeTitle;

                if (pts >= 200) {
                    userBadgeLevel.className = "badge bg-dark text-warning ms-1 border border-warning";
                } else if (pts >= 100) {
                    userBadgeLevel.className = "badge bg-dark text-warning ms-1";
                } else if (pts >= 50) {
                    userBadgeLevel.className = "badge bg-dark text-info ms-1";
                } else {
                    userBadgeLevel.className = "badge bg-secondary ms-1";
                }
            }
            
            userBadge.classList.remove('d-none');
        }

        if (loginBtn) {
            loginBtn.className = "btn btn-success btn-sm fw-bold rounded-pill px-3 shadow-sm";
            loginBtn.innerHTML = `<i class="fa-solid fa-circle-user me-1"></i> Welcome, ${user.name} <span class="ms-2 text-white fw-bold" onclick="handleLogout(event)" title="Logout">✕</span>`;
            loginBtn.removeAttribute('data-bs-toggle');
        }
    }
}

// Fallback Badge Title Calculator
function getFrontendBadgeTitle(points) {
    if (points >= 200) return 'CEP Legend 🌟';
    if (points >= 100) return 'CEP Champion 🏆';
    if (points >= 50)  return 'CEP Helper 🤝';
    return 'CEpian Contributor 🌱';
}

async function handleCollegeLogin(event) {
    if (event) event.preventDefault();

    const nameInput = document.getElementById('studentName');
    const rollNoInput = document.getElementById('studentRollNo');

    if (!nameInput || !rollNoInput) return;

    const name = nameInput.value.trim();
    const rollNo = rollNoInput.value.trim();

    const rollPattern = /^[S|s][1-8][A-Za-z]{2,5}\d{1,3}$/;

    if (rollPattern.test(rollNo)) {
        const formattedRollNo = rollNo.toUpperCase();
        
        let initialKarma = 0;
        let initialBadge = 'CEpian Contributor 🌱';
        try {
            const res = await fetch(`/api/users/${formattedRollNo}/karma`);
            if (res.ok) {
                const karmaData = await res.json();
                initialKarma = karmaData.karmaPoints;
                initialBadge = karmaData.badge;
            }
        } catch (err) {
            console.error("Karma fetch error during login", err);
        }

        const userData = {
            name: name,
            rollNo: formattedRollNo,
            points: initialKarma,
            badge: initialBadge
        };

        localStorage.setItem('cepUser', JSON.stringify(userData));

        alert(`Welcome ${name}! You are now logged into Campus Care.`);

        const loginModalElement = document.getElementById('loginModal');
        if (loginModalElement) {
            const modalInstance = bootstrap.Modal.getInstance(loginModalElement) || new bootstrap.Modal(loginModalElement);
            modalInstance.hide();
        }

        checkUserLoginStatus();
        fetchListings();
    } else {
        alert("Invalid Roll Number Format! (Use format like S3CSA53, S1ECE12, etc.)");
    }
}

function handleLogout(event) {
    if (event) event.stopPropagation();
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem('cepUser');
        location.reload();
    }
}

// ================= FORM DYNAMIC INTENT SWITCHER =================

function toggleIntentOptions() {
    const typeSelect = document.getElementById('type');
    const intentSelect = document.getElementById('intent');
    if (!typeSelect || !intentSelect) return;

    const val = typeSelect.value;
    if (val === 'Lost') {
        intentSelect.value = 'Request';
        intentSelect.disabled = true;
    } else if (val === 'Found') {
        intentSelect.value = 'Offer';
        intentSelect.disabled = true;
    } else {
        intentSelect.disabled = false;
    }
}

// ================= API & FEED LOGIC =================

async function fetchListings() {
    const container = document.getElementById('listingsContainer');
    if (!container) return;

    try {
        const response = await fetch('/api/items');
        allCampusItems = await response.json();

        updateCounters(allCampusItems);
        renderListings(allCampusItems);
    } catch (error) {
        console.error("Error fetching listings:", error);
        container.innerHTML = `
            <div class="col-12 text-center py-5 text-danger">
                <i class="fa-solid fa-triangle-exclamation fa-2x mb-2"></i>
                <p>Failed to connect to CEP Database. Make sure Node.js server is running.</p>
            </div>`;
    }
}

function updateCounters(items) {
    const lostCounter = document.getElementById('lostCounter');
    const foundCounter = document.getElementById('foundCounter');
    const resourceCounter = document.getElementById('resourceCounter');

    if (lostCounter && foundCounter && resourceCounter) {
        const lost = items.filter(i => i.type === 'Lost').length;
        const found = items.filter(i => i.type === 'Found').length;
        const resource = items.filter(i => i.type === 'Resource' || i.type === 'Skill').length;

        lostCounter.innerText = lost;
        foundCounter.innerText = found;
        resourceCounter.innerText = resource;
    }
}

function renderListings(items) {
    const container = document.getElementById('listingsContainer');
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted py-4"><p>No listings available right now in Campus Care.</p></div>';
        return;
    }

    const userObj = JSON.parse(localStorage.getItem('cepUser'));
    const currentUserRollNo = userObj ? userObj.rollNo : '';

    items.forEach(item => {
        const badgeColor = item.type === 'Lost' ? 'bg-danger' : (item.type === 'Found' ? 'bg-success' : 'bg-primary');
        const intentBadge = item.intent === 'Request' 
            ? `<span class="badge bg-warning text-dark me-1">Request</span>` 
            : `<span class="badge bg-info text-dark me-1">Offer</span>`;

        const flaggedBadge = item.isFlagged 
            ? `<span class="badge bg-danger ms-1" title="Multiple users reported this post"><i class="fa-solid fa-triangle-exclamation"></i> Under Review</span>` 
            : '';

        const img = item.imageUrl || 'https://via.placeholder.com/300x180?text=CEP+Campus+Care';

        const isMyPost = item.rollNo && currentUserRollNo && (item.rollNo.toUpperCase() === currentUserRollNo.toUpperCase());

        // Display Claim Passcode ONLY to the post owner
        const passcodeDisplay = (isMyPost && item.passcode) ? `
            <div class="alert alert-light border border-warning text-dark p-2 my-2 rounded-3 text-center small">
                <i class="fa-solid fa-key text-warning me-1"></i> <strong>Claim Passcode:</strong> <span class="badge bg-dark text-warning fs-6">${item.passcode}</span>
                <br><span class="text-muted" style="font-size:11px;">Share this passcode with the person during handover.</span>
            </div>
        ` : '';

        const actionButtonsHTML = isMyPost ? `
            <button class="btn btn-success btn-sm rounded-pill me-1" onclick="resolvePost('${item._id}')" title="Mark as Resolved">
                <i class="fa-solid fa-circle-check me-1"></i> Resolved
            </button>
            <button class="btn btn-danger btn-sm rounded-pill" onclick="deletePost('${item._id}')" title="Delete Post">
                <i class="fa-solid fa-trash"></i>
            </button>
        ` : `
            <button class="btn btn-primary btn-sm rounded-pill me-1" onclick="claimWithPasscode('${item._id}')" title="Enter Passcode to Handover">
                <i class="fa-solid fa-handshake me-1"></i> Claim Item
            </button>
            <a href="mailto:${item.email}" class="btn btn-outline-success btn-sm rounded-pill"><i class="fa-solid fa-envelope me-1"></i> Email</a>
            <button class="btn btn-outline-danger btn-sm rounded-pill ms-1" onclick="reportFakePost('${item._id}')" title="Report Fake Post">
                <i class="fa-solid fa-flag"></i>
            </button>
        `;

        const cardHTML = `
            <div class="col-md-4 feed-card-col" data-type="${item.type}">
                <div class="card h-100 border-0 shadow-sm rounded-4 overflow-hidden card-hover">
                    <img src="${img}" class="card-img-top" alt="${item.title}" style="height: 180px; object-fit: cover;">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <span class="badge ${badgeColor}">${item.type}</span>
                                ${intentBadge}
                                ${flaggedBadge}
                            </div>
                            <small class="text-muted"><i class="fa-solid fa-location-dot me-1"></i>${item.location}</small>
                        </div>
                        <h5 class="card-title fw-bold">${item.title}</h5>
                        <p class="card-text text-secondary small mb-2">${item.description || 'No detailed description provided.'}</p>
                        ${item.brand ? `<p class="mb-1 small"><strong>Brand/Dept:</strong> ${item.brand}</p>` : ''}
                        ${item.color ? `<p class="mb-1 small"><strong>Color/Detail:</strong> ${item.color}</p>` : ''}
                        ${item.postedBy ? `<p class="mb-0 small text-muted"><strong>Posted by:</strong> ${item.postedBy}</p>` : ''}
                        ${passcodeDisplay}
                    </div>
                    <div class="card-footer bg-white border-0 pt-0 pb-3 px-3 d-flex justify-content-between align-items-center">
                        <div class="d-flex gap-1 flex-wrap">
                            ${actionButtonsHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += cardHTML;
    });
}

// ================= CLAIM WITH PASSCODE LOGIC =================

async function claimWithPasscode(itemId) {
    const user = JSON.parse(localStorage.getItem('cepUser'));
    if (!user) {
        alert("Please login first to claim items!");
        const loginModalElement = document.getElementById('loginModal');
        if (loginModalElement) {
            const loginModal = new bootstrap.Modal(loginModalElement);
            loginModal.show();
        }
        return;
    }

    const enteredCode = prompt("Enter the 4-digit Claim Passcode provided by the owner:");
    if (!enteredCode) return;

    try {
        const response = await fetch(`/api/items/${itemId}/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                passcode: enteredCode.trim(),
                claimedByRollNo: user.rollNo
            })
        });

        const data = await response.json();

        if (response.ok) {
            if (data.earnedKarma && data.earnedKarma > 0) {
                alert(`🎉 Handover Verified Successfully!\nThe owner earned +${data.earnedKarma} Karma Points!\nOwner Rank: ${data.badge}`);
            } else {
                alert("🎉 Handover Verified Successfully!");
            }
            checkUserLoginStatus();
            fetchListings();
        } else {
            alert("❌ " + (data.error || "Incorrect passcode!"));
        }
    } catch (err) {
        alert("Server error during verification!");
    }
}

async function reportFakePost(itemId) {
    const user = JSON.parse(localStorage.getItem('cepUser'));
    
    if (confirm("Are you sure you want to report this post as Fake / Spam?")) {
        try {
            const res = await fetch(`/api/items/${itemId}/report`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userRollNo: user ? user.rollNo : '' })
            });
            const data = await res.json();
            
            if (res.ok) {
                alert(data.message);
                fetchListings();
            } else {
                alert(data.error || "Failed to report post.");
            }
        } catch (err) {
            alert("Error reporting post!");
        }
    }
}

// ================= CATEGORY FILTER LOGIC =================

function setupFilterTabs() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            buttons.forEach(b => {
                b.classList.remove('btn-primary', 'active');
                b.classList.add('btn-outline-secondary');
            });

            e.target.classList.remove('btn-outline-secondary');
            e.target.classList.add('btn-primary', 'active');

            const selected = e.target.getAttribute('data-category');
            if (selected === 'all') {
                renderListings(allCampusItems);
            } else {
                const filtered = allCampusItems.filter(item => item.type === selected);
                renderListings(filtered);
            }
        });
    });
}

// ================= POST ITEM & AUTO-MATCH LOGIC =================

async function handleReportItem(event) {
    event.preventDefault();

    const user = JSON.parse(localStorage.getItem('cepUser'));
    if (!user) {
        alert("Please login with your Name & Roll Number first before posting!");
        const loginModalElement = document.getElementById('loginModal');
        if (loginModalElement) {
            const loginModal = new bootstrap.Modal(loginModalElement);
            loginModal.show();
        }
        return;
    }

    let typeValue = document.getElementById('type').value;
    let intentValue = document.getElementById('intent').value;

    if (typeValue === 'Lost') {
        intentValue = 'Request';
    } else if (typeValue === 'Found') {
        intentValue = 'Offer';
    }

    const newItem = {
        type: typeValue,
        intent: intentValue,
        title: document.getElementById('title').value,
        brand: document.getElementById('brand').value,
        color: document.getElementById('color').value,
        location: document.getElementById('location').value,
        email: document.getElementById('email').value,
        imageUrl: document.getElementById('imageUrl').value,
        description: document.getElementById('description').value,
        postedBy: user.name,
        rollNo: user.rollNo
    };

    try {
        const response = await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newItem)
        });

        const result = await response.json();

        if (response.ok) {
            alert(`Post published successfully! Your Claim Passcode is: ${result.item.passcode}`);
            
            const reportModalElement = document.getElementById('reportModal');
            const reportModal = bootstrap.Modal.getInstance(reportModalElement);
            if (reportModal) reportModal.hide();
            
            event.target.reset();
            toggleIntentOptions();
            fetchListings();

            if (result.item && result.item._id) {
                checkAutoMatches(result.item._id);
            }
        } else {
            alert(result.error || "Failed to save post. Please try again.");
        }
    } catch (error) {
        console.error("Error posting item:", error);
        alert("Server error occurred!");
    }
}

async function checkAutoMatches(itemId) {
    try {
        const res = await fetch(`/api/items/${itemId}/matches`);
        if (res.ok) {
            const data = await res.json();
            if (data.matchesCount > 0) {
                const match = data.matches[0];
                const content = document.getElementById('matchCardContent');
                if (content) {
                    content.innerHTML = `
                        <h6><strong>${match.title}</strong> (${match.type} - ${match.intent})</h6>
                        <p class="small text-muted mb-1"><strong>Location:</strong> ${match.location}</p>
                        <p class="small text-muted mb-1"><strong>Posted By:</strong> ${match.postedBy}</p>
                        <p class="small text-muted mb-0"><strong>Contact Email:</strong> <a href="mailto:${match.email}">${match.email}</a></p>
                    `;
                    const matchModalElement = document.getElementById('matchModal');
                    if (matchModalElement) {
                        const matchModal = new bootstrap.Modal(matchModalElement);
                        matchModal.show();
                    }
                }
            }
        }
    } catch (err) {
        console.error("Match check error:", err);
    }
}

// ================= RESOLVE & DELETE ACTIONS =================

async function resolvePost(itemId) {
    const user = JSON.parse(localStorage.getItem('cepUser'));
    const userRoll = user ? user.rollNo : prompt("Confirm your Roll Number:");
    if (!userRoll) return;

    if (!confirm("Is this item resolved/returned? It will be marked as resolved and removed from active feed.")) return;

    try {
        const response = await fetch(`/api/items/${itemId}/resolve`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rollNo: userRoll })
        });

        const data = await response.json();
        if (response.ok) {
            alert("✨ " + data.message);
            fetchListings();
        } else {
            alert("❌ Error: " + (data.error || data.message));
        }
    } catch (err) {
        alert("Failed to connect to server.");
    }
}

async function deletePost(itemId) {
    const user = JSON.parse(localStorage.getItem('cepUser'));
    const userRoll = user ? user.rollNo : prompt("Confirm your Roll Number:");
    if (!userRoll) return;

    if (!confirm("Are you sure you want to delete this post permanently?")) return;

    try {
        const response = await fetch(`/api/items/${itemId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rollNo: userRoll })
        });

        const data = await response.json();
        if (response.ok) {
            alert("🗑️ " + data.message);
            fetchListings();
        } else {
            alert("❌ Error: " + (data.error || data.message));
        }
    } catch (err) {
        alert("Failed to connect to server.");
    }
}
