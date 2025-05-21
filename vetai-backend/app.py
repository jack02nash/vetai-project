from flask import Flask, request, jsonify
from flask_cors import CORS
import matplotlib.pyplot as plt
import pandas as pd
import io
import base64
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route("/")
def home():
    return "VetAI is running!"

@app.route("/generate-chart", methods=["POST"])
def generate_chart():
    data = request.json
    print("Received data:", data)
    print("Incoming data:", data)

    if not data or "values" not in data:
        return jsonify({"error": "Missing 'values' in request"}), 400

    df = pd.DataFrame(data["values"], columns=["Label", "Value"])
    ...

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
