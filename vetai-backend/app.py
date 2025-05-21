from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import os
from dotenv import load_dotenv
from openai import OpenAI
import logging
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": [
            "https://vetai-project.vercel.app",
            "https://vetai-project-frontend.vercel.app",
            "http://localhost:3000"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Configure OpenAI
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
if not client.api_key:
    logger.error("OpenAI API key not found in environment variables!")

@app.route("/")
def home():
    return "VetAI is running!"

@app.route("/api/chat", methods=["POST"])
def chat():
    try:
        data = request.json
        logger.info(f"Received chat request with data: {data}")
        
        if not data or "messages" not in data:
            logger.error("Missing messages in request")
            return jsonify({"error": "Missing messages in request"}), 400

        if not client.api_key:
            logger.error("OpenAI API key not configured")
            return jsonify({"error": "OpenAI API key not configured"}), 500

        response = client.chat.completions.create(
            model=data.get("model", "gpt-4"),
            messages=data["messages"]
        )
        logger.info("Successfully got response from OpenAI")

        return jsonify({"response": response.choices[0].message.content})
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    try:
        data = request.json
        logger.info(f"Received stream request with data: {data}")
        
        if not data or "messages" not in data:
            logger.error("Missing messages in request")
            error_data = {"error": "Missing messages in request"}
            return Response(f"data: {json.dumps(error_data)}\n\n", content_type='text/event-stream')

        if not client.api_key:
            logger.error("OpenAI API key not configured")
            error_data = {"error": "OpenAI API key not configured"}
            return Response(f"data: {json.dumps(error_data)}\n\n", content_type='text/event-stream')

        def generate():
            try:
                response = client.chat.completions.create(
                    model=data.get("model", "gpt-4"),
                    messages=data["messages"],
                    stream=True,
                    max_tokens=2000  # Add a reasonable limit
                )

                for chunk in response:
                    try:
                        if chunk and chunk.choices and chunk.choices[0].delta.content:
                            content = chunk.choices[0].delta.content
                            response_data = {
                                "choices": [{"delta": {"content": content}}]
                            }
                            yield f"data: {json.dumps(response_data)}\n\n"
                    except Exception as chunk_error:
                        logger.error(f"Error processing chunk: {str(chunk_error)}")
                        error_data = {"error": f"Error processing response: {str(chunk_error)}"}
                        yield f"data: {json.dumps(error_data)}\n\n"
                        return
                
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error(f"Error in stream generation: {str(e)}")
                error_data = {"error": str(e)}
                yield f"data: {json.dumps(error_data)}\n\n"

        return Response(
            stream_with_context(generate()),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )
    except Exception as e:
        logger.error(f"Error in stream endpoint: {str(e)}")
        error_data = {"error": str(e)}
        return Response(f"data: {json.dumps(error_data)}\n\n", content_type='text/event-stream')

if __name__ == "__main__":
    port = int(os.getenv("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=False)
