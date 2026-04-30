from openai import OpenAI

# Initialize client (make sure your API key is set in env variable)
client = OpenAI()

# 1. List all available models
print("=== AVAILABLE MODELS ===")
models = client.models.list()

embedding_models = []

for model in models.data:
    # Filter models that likely support embeddings
    if "embedding" in model.id.lower():
        embedding_models.append(model.id)
        print(model.id)

# 2. Try calling each embedding model
print("\n=== TESTING EMBEDDING MODELS ===")

test_text = "Hello world"

for model in embedding_models:
    try:
        response = client.embeddings.create(
            model=model,
            input=test_text
        )
        print(f"✅ {model} → WORKS")
    except Exception as e:
        print(f"❌ {model} → FAILED: {str(e)}")