from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import matplotlib.pyplot as plt
import pandas as pd
import io
import base64
import os
from dotenv import load_dotenv
import openai
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Configure OpenAI
openai.api_key = os.getenv("OPENAI_API_KEY")
if not openai.api_key:
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

        if not openai.api_key:
            logger.error("OpenAI API key not configured")
            return jsonify({"error": "OpenAI API key not configured"}), 500

        response = openai.ChatCompletion.create(
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

        if not openai.api_key:
            logger.error("OpenAI API key not configured")
            return jsonify({"error": "OpenAI API key not configured"}), 500

        def generate():
            try:
                response = openai.ChatCompletion.create(
                    model=data.get("model", "gpt-4"),
                    messages=data["messages"],
                    stream=True
                )

                for chunk in response:
                    if chunk and chunk.choices and chunk.choices[0].delta.get("content"):
                        content = chunk.choices[0].delta.content
                        yield f"data: {{'choices': [{{'delta': {{'content': '{content}' }}}}]}}\n\n"
                
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error(f"Error in stream generation: {str(e)}")
                yield f"data: {{'error': '{str(e)}'}}\n\n"

        return Response(stream_with_context(generate()), content_type='text/event-stream')
    except Exception as e:
        logger.error(f"Error in stream endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/generate-chart", methods=["POST"])
def generate_chart():
    data = request.json
    logger.info(f"Received chart data: {data}")

    if not data or "values" not in data:
        logger.error("Missing values in chart request")
        return jsonify({"error": "Missing 'values' in request"}), 400

    df = pd.DataFrame(data["values"], columns=["Label", "Value"])
    ...

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
