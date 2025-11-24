from flask import Flask, render_template, request, jsonify
import json
import uuid
from pathlib import Path
import concurrent.futures
import os

app = Flask(__name__)

TREE_FILE = Path('tree_state.json')
CONFIG_FILE = Path('.config')

# Default configuration
DEFAULT_CONFIG = {
    'token': '',  # Main API key (stored in .config)
    'model': 'moonshotai/kimi-k2::deepinfra/fp4',
    'temperature': 0.9,
    'min_p': 0.01,
    'max_tokens': 32,
    'stream': True,
    'autosave': True,
    'dark_mode': False,
    'provider': 'openrouter',
    'custom_api_key': '',
    'openai_endpoint': 'http://localhost:8080/v1',
    'untitled_trick': False
}

def load_config():
    """Load application configuration from file"""
    config = DEFAULT_CONFIG.copy()
    
    if not CONFIG_FILE.exists():
        # Create default config file if it doesn't exist
        save_config(config)
        print(f"Created default config file: {CONFIG_FILE}")
    else:
        try:
            with open(CONFIG_FILE, 'r') as f:
                saved_config = json.load(f)
                config.update(saved_config)
        except Exception as e:
            print(f"Error loading config: {e}")
    
    return config

def save_config(config):
    """Save application configuration to file"""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        print(f"Error saving config: {e}")

def load_tree():
    if TREE_FILE.exists():
        try:
            with open(TREE_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, ValueError):
            # corrupted/empty file, return empty tree
            return {'nodes': {}, 'focused_node_id': None}
    return {'nodes': {}, 'focused_node_id': None}

def save_tree(tree):
    with open(TREE_FILE, 'w') as f:
        json.dump(tree, f, indent=2)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/settings', methods=['GET'])
def get_settings():
    """Return current settings"""
    return jsonify(load_config())

@app.route('/settings', methods=['POST'])
def save_settings():
    """Save settings to config file"""
    # Load existing config
    existing_config = load_config()
    
    # Update with new settings
    new_settings = request.json
    
    # If token is provided (non-empty), update it. Otherwise keep existing.
    if 'token' in new_settings and new_settings['token']:
        existing_config['token'] = new_settings['token']
    
    # Update other settings
    for key, value in new_settings.items():
        if key != 'token':  # token already handled above
            existing_config[key] = value
    
    save_config(existing_config)
    return jsonify({'status': 'ok'})

@app.route('/tree', methods=['GET'])
def get_tree():
    return jsonify(load_tree())

@app.route('/tree/create', methods=['POST'])
def create_tree():
    data = request.json
    seed_text = data['seed']
    
    root_id = str(uuid.uuid4())
    tree = {
        'nodes': {
            root_id: {
                'id': root_id,
                'parent_id': None,
                'type': 'ai',
                'text': seed_text,
                'position': {'x': 400, 'y': 300},
                'loading': False,
                'error': None
            }
        },
        'focused_node_id': root_id
    }
    
    save_tree(tree)
    return jsonify(tree)

@app.route('/tree/focus', methods=['POST'])
def focus_node():
    data = request.json
    tree = load_tree()
    tree['focused_node_id'] = data['node_id']
    save_tree(tree)
    return jsonify({'status': 'ok'})

@app.route('/tree/save', methods=['POST'])
def save_tree_route():
    data = request.json
    save_tree(data)
    return jsonify({'status': 'ok'})

@app.route('/generate', methods=['POST'])
def generate():
    data = request.json
    parent_id = data['parent_node_id']
    settings = data['settings']
    n_siblings = data['n_siblings']
    placeholder_ids = data['placeholder_ids']
    
    tree = load_tree()
    
    # Build context
    context = build_context(tree, parent_id)
    
    # Generate in parallel
    def generate_one(placeholder_id):
        try:
            result_text = call_model_api(context, settings)
            return {
                'id': placeholder_id,
                'text': result_text,
                'error': None
            }
        except Exception as e:
            return {
                'id': placeholder_id,
                'text': '',
                'error': str(e)
            }
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=n_siblings) as executor:
        futures = [executor.submit(generate_one, pid) for pid in placeholder_ids]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]
    
    # Update tree
    for result in results:
        if result['id'] in tree['nodes']:
            tree['nodes'][result['id']]['text'] = result['text']
            tree['nodes'][result['id']]['loading'] = False
            if result['error']:
                tree['nodes'][result['id']]['error'] = result['error']
    
    save_tree(tree)
    
    return jsonify({'nodes': results})

def build_context(tree, node_id):
    """Walk tree from root to node, concatenating deltas"""
    path = []
    current = tree['nodes'].get(node_id)
    
    while current:
        path.insert(0, current)
        current = tree['nodes'].get(current.get('parent_id'))
    
    return ''.join(node['text'] for node in path)

def call_model_api(context, settings):
    """Call model API - auto-detect provider from model string"""
    import requests
    
    provider = settings.get('provider', 'openrouter')
    model_str = settings.get('model', '')
    endpoint_url = settings.get('endpoint', '')
    
    # Get token - priority: settings.token > env var > config file
    token = settings.get('token', '') or settings.get('api_key', '')
    if not token:
        token = os.environ.get('OPENROUTER_API_KEY', '')
    if not token:
        # Load from config file as last resort
        config = load_config()
        token = config.get('token', '')
    
    # Determine endpoint based on provider
    if provider == 'openai':
        # Use the endpoint from detection
        if not endpoint_url.endswith('/completions'):
            endpoint_url = endpoint_url.rstrip('/') + '/v1/completions'
    else:
        # OpenRouter
        if settings.get('untitled_trick', False):
            endpoint_url = 'https://openrouter.ai/api/v1/chat/completions'
        else:
            endpoint_url = 'https://openrouter.ai/api/v1/completions'
    
    # Handle :: provider targeting syntax
    target_provider = None
    if '::' in model_str:
        model_str, target_provider = model_str.split('::', 1)
    
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f"Bearer {token}"
    
    # Build payload
    if settings.get('untitled_trick', False):
        # Chat completions for untitled trick
        payload = {
            'model': model_str,
            'max_tokens': settings.get('max_tokens', 500),
            'temperature': settings.get('temperature', 1.0),
            'system': "The assistant is in CLI simulation mode, and responds to the user's CLI commands only with the output of the command.",
            'messages': [
                {'role': 'user', 'content': f"<cmd>cat untitled.txt</cmd> (5.8 KB)"},
                {'role': 'assistant', 'content': context}
            ],
            'stream': False
        }
        response = requests.post(endpoint_url, headers=headers, json=payload, timeout=60)
    else:
        # Standard completions
        payload = {
            'model': model_str,
            'prompt': context,
            'temperature': settings.get('temperature', 1.0),
            'min_p': settings.get('min_p', 0.01),
            'max_tokens': settings.get('max_tokens', 500),
            'stream': False
        }
        
        # Provider targeting for OpenRouter
        if target_provider and provider == 'openrouter':
            payload['provider'] = {'order': [target_provider], 'allow_fallbacks': False}
        
        response = requests.post(endpoint_url, headers=headers, json=payload, timeout=60)
    
    if response.status_code != 200:
        error_text = response.text[:200] if response.text else 'Unknown error'
        raise Exception(f"API error {response.status_code}: {error_text}")
    
    result = response.json()
    
    # Handle response format
    if settings.get('untitled_trick', False):
        return result.get("choices", [{}])[0].get("message", {}).get("content", "")
    else:
        return result.get("choices", [{}])[0].get("text", "")

if __name__ == '__main__':
    # Initialize config on startup
    load_config()
    app.run(debug=True, port=5000)

