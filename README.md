🎭 AI Face Swap Application
A web application that swaps faces between images using AI technology. Upload two photos and get a professional face-swapped result in minutes.

✨ Features
AI-Powered Face Swapping - High-quality results using LightX API

Multiple Upload Options - File upload or camera capture

Real-time Processing - Live progress tracking

Download Results - Get source, target, and swapped images

Responsive Design - Works on desktop and mobile

🚀 Quick Start
Prerequisites
Node.js (v18+)

MongoDB

LightX API key

Cloudinary account

Installation
Clone the repository

bash
git clone https://github.com/yourusername/face-swap-app.git
cd face-swap-app
Install dependencies

bash
npm install
Set up environment variables
Create .env file:

text
PORT=3000
MONGODB_URI=mongodb://localhost:27017/face-swap-db
LIGHTX_API_KEY=your_lightx_api_key
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
Start the application

bash
npm run dev
Visit http://localhost:3000

🎯 Usage
Fill in your details (name, email, phone)

Upload source image (your photo)

Upload target image (style face)

Click "Create Face Swap"

Download your result

🛠️ Tech Stack
Backend: Node.js, Express.js, MongoDB

Frontend: HTML, CSS, JavaScript, EJS

APIs: LightX API, Cloudinary

File Upload: Multer

📁 Project Structure
text
├── controllers/ # Route handlers
├── models/ # Database models
├── routes/ # Express routes
├── views/ # EJS templates
├── public/ # Static files
├── uploads/ # Temporary storage
└── app.js # Main application
🔧 API Endpoints
GET / - Main form page

POST /submit - Handle form submission

GET /submissions - List all submissions

GET /submissions/:id - View submission details

GET /download/:id/:type - Download images

📝 License
MIT License

👨‍💻 Author
Ashu Jha

Email: silliconvally009@gmail.com

GitHub: @yourusername

⭐ Star this repo if you found it helpful!
