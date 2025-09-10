FaceSwap Application:
This is a web application that allows users to perform a face swap on two uploaded images. The application uses the LightX API for the face-swapping functionality, stores user submissions in a MongoDB database, and hosts images on Cloudinary.

Features
Face Swapping: Users can upload a source and a target image to generate a new image with the source face swapped onto the target.

Submission Tracking: All face swap requests are logged and stored in a MongoDB database.

Image Hosting: The uploaded images and the final swapped images are hosted securely on Cloudinary.

Form Validation: The application includes robust server-side validation for user input and file uploads.

Rate Limiting: Includes basic rate-limiting to prevent abuse.

Prerequisites
Before you begin, ensure you have the following accounts and software installed:

Node.js & npm: Download and install from the official website.

MongoDB: You'll need a MongoDB database. You can use a local instance or a cloud-hosted one like MongoDB Atlas.

Cloudinary Account: Sign up for a free account to get your credentials.

LightX API Key: Sign up for the LightX API to obtain an API key for face swapping.

Installation:

1. Clone the repository
   git clone <repository_url>
   cd <repository_folder>
2. Configure environment variables
   Create a .env file in the root directory of your project with the following variables:

PORT=3000

# MongoDB

MONGODB_URI="your_mongodb_connection_string"

# Cloudinary

CLOUDINARY_CLOUD_NAME="your_cloudinary_cloud_name"
CLOUDINARY_API_KEY="your_cloudinary_api_key"
CLOUDINARY_API_SECRET="your_cloudinary_api_secret"

# LightX API

LIGHTX_API_KEY="your_lightx_api_key"
Note: Replace the placeholder values with your actual credentials.

3. Install dependencies
   Install the required npm packages by running:
   npm install

4. Run the application
   Start the server using the following command:
   node app.js
   The application will now be running at http://localhost:3000.

##

User View
Navigate to http://localhost:3000 to access the face swap form.

Fill in your details and upload a source image and a target image.

Click Submit to process the request. The application will display the final swapped image once complete.

##

Project Structure

app.js: The main entry point of the application, responsible for setting up Express, middleware, and routes.

routes/submissionRoutes.js: Defines all API endpoints for handling submissions, including file uploads and form processing.

controllers/submissionController.js: Contains the logic for handling HTTP requests and responses for submissions.

models/submissionModel.js: Manages all database interactions with MongoDB.

config/db.js: Handles the connection to the MongoDB database.

config/cloudinary.js: Configures and manages all interactions with the Cloudinary image hosting service.

utils/faceSwapApi.js: A wrapper for the external LightX API, handling the face swap requests and polling for results.

public/: Contains static assets like stylesheets and client-side JavaScript.

views/: Houses the EJS templates for rendering HTML pages.
