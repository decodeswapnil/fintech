

# FinanceHub

A full-stack financial web application that allows users to track real-time stock market data, manage personalized watchlists, and monitor portfolio performance securely.

**Live Demo:** https://finzo.pages.dev/

---

## 🚀 Features

- 🔐 Secure user authentication using Firebase Authentication  
- 📈 Real-time stock data via Financial Modeling Prep (FMP) API  
- 🛡️ API key protection using a Cloudflare Worker proxy  
- 📊 Portfolio and watchlist management with Firebase Firestore  
- 📉 Interactive charts and market indicators  
- 🌙 Light/Dark mode support  

---

## 🧠 Tech Stack

| Layer | Technology |
|------|------------|
| Frontend | HTML, CSS, JavaScript |
| Charts | Chart.js |
| Auth & DB | Firebase Authentication, Firestore |
| Market Data API | Financial Modeling Prep (FMP) |
| API Security | Cloudflare Workers (Proxy Layer) |
| Hosting | Cloudflare Pages |

---

## 🔐 Security Architecture

To prevent exposing the FMP API key on the client, all API requests are routed through a **Cloudflare Worker proxy**. This adds an additional security layer and avoids direct client-side access to sensitive credentials.

### Request Flow
```
Client → Cloudflare Worker Proxy → FMP API → Worker → Client
```

### Why this matters:
- Prevents API key leaks
- Enables request validation and rate limiting
- Adds a secure gateway layer
- Production-style API architecture

---

## 📂 Project Structure

```
fintech/
├── index.html
├── style.css
├── app.js
├── README.md
```

---

## 🛠 Setup & Run Locally

1. Clone the repository  
   ```bash
   git clone https://github.com/decodeswapnil/fintech.git
   cd fintech
   ```

2. Configure Firebase  
   - Create a Firebase project  
   - Enable Authentication and Firestore  
   - Add your Firebase config to `app.js`

3. Configure Cloudflare Worker  
   - Set up a Worker to proxy FMP API requests  
   - Store API keys securely in Worker environment variables  

4. Open in browser  
   ```bash
   open index.html
   ```

---

## 🎯 Purpose

This project demonstrates real-world skills in:

- Full-stack web development
- Secure API design
- Cloud-based authentication and storage
- Frontend data visualization
- Production-style architecture thinking

---

## 👤 Author

**Swapnil Kumar**  
AI/ML Engineer | Full Stack Developer  

- GitHub: https://github.com/decodeswapnil  
- Portfolio: https://decodeswapnil.github.io  