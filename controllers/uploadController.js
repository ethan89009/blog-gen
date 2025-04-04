require('dotenv').config(); // Ensure environment variables are loaded
const { google } = require('googleapis'); // Use googleapis

// Use the built-in fetch from Node.js 18+ (global fetch is standard)
/* global fetch */

// --- Google Auth Setup ---
let auth;
let sheets;
let drive;
try {
    // Load service account credentials from the environment variable
    // Ensure the variable contains the JSON string, not a file path
    const credentialsString = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsString) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set or empty.');
    }
    const credentials = JSON.parse(credentialsString);

    auth = new google.auth.GoogleAuth({
        credentials, // directly passing the credentials object
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive' // Needed to move the file
        ]
    });
    sheets = google.sheets({ version: 'v4', auth });
    drive = google.drive({ version: 'v3', auth });
    console.log("Google API Authentication successful.");
} catch (error) {
    console.error("Error initializing Google Auth:", error);
    // You might want to handle this more gracefully depending on requirements
    // For now, requests will fail later if auth isn't set up.
    auth = null;
    sheets = null;
    drive = null;
}
// --- End Google Auth Setup ---


// --- MODELS Object (largely the same as your Next.js version) ---
const MODELS = {
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        callLLM: async function (prompt, topics, style) {
            if (!this.apiKey) {
                return "[Gemini API not configured]";
            }
            // Simplified default style check
            const effectiveStyle = style || "Provocative, Engaging, Informative";
            const topicsContext = topics.join(", ");
            const instructionStrict =
                "STRICT: If the prompt contains formatting guidelines, ignore them; otherwise, follow these GUIDELINES: Use #, ##, ### for titles, subtitles, and subheadings. Number the topics starting from 1. Below each topic, provide one paragraph per style preceded by the style name as a subheading.";
            const textInput = `${instructionStrict}\nPrompt: "${prompt}"\nTopics: "${topicsContext}"\nStyle: ${effectiveStyle}`;
            const payload = {
                contents: [{ parts: [{ text: textInput }] }]
            };
            const urlWithKey = this.apiUrl + "?key=" + encodeURIComponent(this.apiKey);
            const options = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            };
            try {
                const response = await fetch(urlWithKey, options);
                 if (!response.ok) {
                     const errorBody = await response.text();
                     console.error(`Gemini API Error ${response.status}: ${errorBody}`);
                     return `[Gemini API Error: ${response.status}]`;
                 }
                const json = await response.json();
                 // Add robust checking for response structure
                 if (!json.candidates || !json.candidates[0] || !json.candidates[0].content || !json.candidates[0].content.parts || !json.candidates[0].content.parts[0]) {
                     console.error("Unexpected Gemini API response structure:", json);
                     return "[Gemini API Error: Unexpected response structure]";
                 }
                const text = json.candidates[0].content.parts[0].text;
                return text;
            } catch (error) {
                console.error("Error calling Gemini API:", error);
                return "[Gemini API Call Failed]";
            }
        },
        evalLLM: async function (modelOutput) {
            // Check if modelOutput is valid before proceeding
            if (typeof modelOutput !== 'string' || modelOutput.startsWith("[")) {
                 return { comment: `Skipping evaluation due to invalid input: ${modelOutput}`, rating: "0" };
            }
            if (!this.apiKey) {
                return { comment: "[Gemini API not configured for evaluation]", rating: "0" };
            }
            const evalPrompt =
                `You are an evaluator model that must analyze the output generated by a model. Evaluate the authenticity of the output, verify references, and comment on its quality. Based on the accuracy, generate a JSON response like:
{
 "comment": "Your comment on the output",
 "rating": "A value from 0-10 based on accuracy"
}
Provide only the JSON response as plain text (suitable for JSON.parse()). Do not use markdown formatting (like \`\`\`json).`;
            const textInput = `${evalPrompt}\nOutput: "${modelOutput}"`;
            const payload = {
                contents: [{ parts: [{ text: textInput }] }]
            };
            const urlWithKey = this.apiUrl + "?key=" + encodeURIComponent(this.apiKey);
            const options = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            };
            try {
                const response = await fetch(urlWithKey, options);
                 if (!response.ok) {
                     const errorBody = await response.text();
                     console.error(`Gemini Eval API Error ${response.status}: ${errorBody}`);
                     return { comment: `[Gemini Eval API Error: ${response.status}]`, rating: "0" };
                 }
                const json = await response.json();
                 // Add robust checking for eval response structure
                 if (!json.candidates || !json.candidates[0] || !json.candidates[0].content || !json.candidates[0].content.parts || !json.candidates[0].content.parts[0]) {
                     console.error("Unexpected Gemini Eval API response structure:", json);
                     return { comment: "[Gemini Eval API Error: Unexpected response structure]", rating: "0" };
                 }
                let evalText = json.candidates[0].content.parts[0].text;
                let evalResult;
                try {
                     // More robust cleaning
                     const cleanedText = evalText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
                     evalResult = JSON.parse(cleanedText);
                     // Validate expected structure
                     if (typeof evalResult.comment !== 'string' || typeof evalResult.rating !== 'string') {
                         throw new Error("Parsed JSON missing required fields 'comment' or 'rating'");
                     }
                } catch (e) {
                    console.error("Error parsing evaluation output:", e, "\nRaw output:", evalText);
                    // Try to return the raw text if parsing fails but provide context
                    evalResult = { comment: `Error parsing evaluation JSON: ${e.message}. Raw: ${evalText.substring(0,100)}...`, rating: "0" };
                }
                return evalResult;
            } catch (error) {
                console.error("Error calling Gemini Eval API:", error);
                return { comment: "[Gemini Eval API Call Failed]", rating: "0" };
            }
        }
    },
    // Include Perplexity, Claude, ChatGPT objects here if needed, similar structure
    perplexity: { /* ... definition ... */ },
    claude: { /* ... definition ... */ },
    chatgpt: { /* ... definition ... */ }
};
// --- End MODELS Object ---


// --- Main Controller Function ---
async function generateOutputFromUpload(req, res) {
    // Check if Google Auth was successful
    if (!auth || !sheets || !drive) {
        console.error("Google Auth not initialized. Cannot process request.");
        return res.status(500).send({ message: "Server configuration error: Google Authentication failed." });
    }

    try {
        // Validate that both files were uploaded using multer
        if (!req.files || !req.files['promptFile'] || !req.files['topicsFile']) {
            return res.status(400).send({ message: "Please upload both prompt and topics files." });
        }
        const promptFile = req.files['promptFile'][0];
        const topicsFile = req.files['topicsFile'][0];

        // Read content from buffers provided by multer
        const promptText = promptFile.buffer.toString('utf-8');
        const topicsText = topicsFile.buffer.toString('utf-8');

        // Process topics file: split by newline and filter out empty lines
        const topics = topicsText.split(/\r?\n/) // Handle both Windows and Unix line endings
                                        .map(line => line.trim())
                                        .filter(line => line !== "");

        if (topics.length === 0) {
            return res.status(400).send({ message: "Topics file is empty or contains no valid topics." });
        }

        // Define header row (same as before)
        const header = [
            "Topic",
            "Gemini", "Gemini_comment_gemini", "Gemini_rate_gemini",
            "Perplexity", "Gemini_comment_perplexity", "Gemini_rate_perplexity",
            "Claude", "Gemini_comment_claude", "Gemini_rate_claude",
            "ChatGPT", "Gemini_comment_chatgpt", "Gemini_rate_chatgpt"
        ];
        const data = [header];

        console.log(`Processing ${topics.length} topics...`);

        // Generate data rows (only calling Gemini for now)
        for (const topic of topics) {
            console.log(` - Processing topic: ${topic}`);
            const row = [];
            row.push(topic); // Topic

            // Call Gemini API to generate output
            const geminiOutput = await MODELS.gemini.callLLM(promptText, [topic], ""); // Using default style
            row.push(geminiOutput); // Gemini Output

            // Call Gemini evalLLM to evaluate the Gemini output
            const evalResultGemini = await MODELS.gemini.evalLLM(geminiOutput);
            row.push(evalResultGemini.comment); // Gemini_comment_gemini
            row.push(evalResultGemini.rating);  // Gemini_rate_gemini

            // --- Placeholder columns for other models ---
            // If you implement other models, replace these placeholders similarly
            // For now, evalLLM won't be called on empty strings
            const placeholderOutput = ""; // Or "[Not Run]"
            const placeholderEval = { comment: "", rating: "" };

            // Perplexity Placeholders
            row.push(placeholderOutput); // Perplexity Output
            row.push(placeholderEval.comment); // Gemini_comment_perplexity
            row.push(placeholderEval.rating);  // Gemini_rate_perplexity

            // Claude Placeholders
            row.push(placeholderOutput); // Claude Output
            row.push(placeholderEval.comment); // Gemini_comment_claude
            row.push(placeholderEval.rating);  // Gemini_rate_claude

            // ChatGPT Placeholders
            row.push(placeholderOutput); // ChatGPT Output
            row.push(placeholderEval.comment); // Gemini_comment_chatgpt
            row.push(placeholderEval.rating);  // Gemini_rate_chatgpt
            // --- End Placeholder columns ---

            data.push(row);
            console.log(`    - Finished topic: ${topic}`);
        }

        console.log("Finished processing all topics. Creating Google Sheet...");

        // --- Create Google Sheet ---
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // More file-system friendly timestamp
        const title = `LLM_Output_${timestamp}`;

        const spreadsheetResponse = await sheets.spreadsheets.create({
            requestBody: {
                properties: { title: title },
                sheets: [{ properties: { title: "Output" } }] // Specify sheet name
            }
        });
        const spreadsheetId = spreadsheetResponse.data.spreadsheetId;
        const fileUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
        console.log(`Created Google Sheet with ID: ${spreadsheetId}`);

        // --- Update Google Sheet with data ---
        await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: "Output!A1", // Target the correct sheet name and starting cell
            valueInputOption: "USER_ENTERED", // Or "RAW". USER_ENTERED tries to interpret values (e.g., numbers)
            requestBody: { values: data }
        });
        console.log(`Updated sheet "${title}" with data.`);

        // --- Optionally, move the spreadsheet to a specific Drive folder ---
        const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        if (driveFolderId) {
            console.log(`Moving sheet ${spreadsheetId} to folder ${driveFolderId}...`);
            // First, get the file's current parents to remove them
            const file = await drive.files.get({
                    fileId: spreadsheetId,
                    fields: 'parents'
                });
                const previousParents = file.data.parents ? file.data.parents.join(',') : '';

            await drive.files.update({
                fileId: spreadsheetId,
                addParents: driveFolderId,
                removeParents: previousParents, // Remove from root or previous folders
                fields: 'id, parents' // Specify fields to include in response
            });
            console.log(`Moved sheet ${spreadsheetId} successfully.`);
        }

        // Respond with the modified HTML
                const htmlResponse = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Output Generated</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fadeInUp {
                    animation: fadeInUp 0.5s ease-out both;
                }
            </style>
        </head>
        <body class="bg-gradient-to-r from-indigo-500 to-purple-600 min-h-screen flex items-center justify-center">
            <div class="bg-white rounded-lg shadow-xl p-8 max-w-md w-full animate-fadeInUp">
                <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">Output Generated!</h1>
                <p class="text-gray-700 text-center mb-4">Your output file has been successfully generated.</p>

                <div class="bg-gray-100 p-6 rounded-md mb-6">
                    <div class="mb-4">
                        <span class="font-semibold text-gray-600">File Name:</span>
                        <span id="fileName" class="text-gray-800">${title}.xlsx</span>
                    </div>
                    <div class="text-center">
                        <a id="destinationLink" href="https://drive.google.com/drive/folders/${process.env.GOOGLE_DRIVE_FOLDER_ID}" target="_blank" class="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition duration-150 inline-block">
                            Go to Destination Folder
                        </a>
                    </div>
                </div>

                <div class="flex justify-center">
                    <a href="/" class="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition duration-150 transform hover:-translate-y-1 inline-block">
                        Upload Files Again
                    </a>
                </div>
            </div>
        </body>
        </html>
        `;

        res.status(200).send(htmlResponse);

    } catch (error) {
        console.error("Error during file processing or API interaction:", error);
        // Check for specific Google API errors if possible
        if (error.response && error.response.data) {
            console.error("Google API Error details:", JSON.stringify(error.response.data, null, 2));
            res.status(error.response.status || 500).send({ message: `Google API Error: ${error.response.data.error?.message || error.message}` });
        } else {
            res.status(500).send({ message: `An error occurred: ${error.message}` });
        }
    }
}
// --- End Main Controller Function ---

module.exports = {
    generateOutputFromUpload
};