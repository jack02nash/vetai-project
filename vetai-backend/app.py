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
CORS(app, resources={r"/*": {"origins": "*"}})

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
            return jsonify({"error": "Missing messages in request"}), 400

        if not client.api_key:
            logger.error("OpenAI API key not configured")
            return jsonify({"error": "OpenAI API key not configured"}), 500

        def generate():
            try:
                response = client.chat.completions.create(
                    model=data.get("model", "gpt-4"),
                    messages=data["messages"],
                    stream=True
                )

                for chunk in response:
                    if chunk and chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        # Properly escape content and format JSON
                        response_data = {
                            "choices": [{"delta": {"content": content}}]
                        }
                        yield f"data: {json.dumps(response_data)}\n\n"
                
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error(f"Error in stream generation: {str(e)}")
                error_data = {"error": str(e)}
                yield f"data: {json.dumps(error_data)}\n\n"

        return Response(stream_with_context(generate()), content_type='text/event-stream')
    except Exception as e:
        logger.error(f"Error in stream endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
