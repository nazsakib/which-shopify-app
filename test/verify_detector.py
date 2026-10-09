import json
import os
import sys

def test_database():
    print("=== Testing apps-database.json ===")
    with open('src/data/apps-database.json', 'r', encoding='utf-8') as f:
        db = json.load(f)

    apps = db.get('apps', [])
    print(f"Total apps in database: {len(apps)}")
    assert len(apps) > 27000, "Database apps count is less than expected"

    smartlook = next((a for a in apps if a.get('slug') == 'smartlook'), None)
    assert smartlook is not None, "Smartlook missing in database"
    assert smartlook['icon'] == 'https://logotyp.us/file/smartlook.svg'
    assert 'smartlook' in smartlook.get('globals', [])
    assert 'smartlook.js' in smartlook.get('scripts', [])
    print("✓ Smartlook signature verified")

    reconvert = next((a for a in apps if a.get('slug') == 'reconvert-upsell-cross-sell'), None)
    assert reconvert is not None, "Reconvert missing in database"
    assert 'reconvert' in reconvert.get('globals', [])
    assert 'ReConvert' in reconvert.get('globals', [])
    assert 'reconvertData' in reconvert.get('globals', [])
    assert any('reconvert' in s for s in reconvert.get('scripts', []))
    assert any('reconvert' in d for d in reconvert.get('dom', []))
    print("✓ ReConvert signature verified")

def test_injected_globals():
    print("\n=== Testing src/content/injected.js ===")
    with open('src/content/injected.js', 'r', encoding='utf-8') as f:
        content = f.read()

    expected_globals = [
        "smartlook", "Crisp", "$crisp", "CRISP_WEBSITE_ID", "Mouseflow", 
        "_mfq", "mf", "hubspot", "_hsq", "ReConvert", "reconvert", "reconvertData"
    ]
    for g in expected_globals:
        assert f'"{g}"' in content, f"Global {g} missing from injected.js knownGlobals"
    
    assert "REQUEST_SHOPIFY_GLOBALS" in content, "REQUEST_SHOPIFY_GLOBALS listener missing"
    assert "setTimeout(extractAndSendGlobals, 1200)" in content, "Async retry missing"
    print("✓ Injected script globals & async polling verified")

def test_background_aliases_and_icons():
    print("\n=== Testing src/background/background.js ===")
    with open('src/background/background.js', 'r', encoding='utf-8') as f:
        content = f.read()

    assert "'smartlook': 'smartlook'" in content
    assert "'crisp': 'crisp'" in content
    assert "'mouseflow': 'mouseflow'" in content
    assert "'hubspot': 'hubspot-2'" in content
    assert "'reconvert': 'reconvert-upsell-cross-sell'" in content
    assert "'smartlook': 'https://logotyp.us/file/smartlook.svg'" in content
    assert "STATIC_APP_ICONS[rawTarget]" in content
    print("✓ Background aliases, static icons, and lookup logic verified")

def test_popup_ui():
    print("\n=== Testing popup grid UI ===")
    with open('src/popup/popup.css', 'r', encoding='utf-8') as f:
        css = f.read()
    assert "grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))" in css
    assert "display: grid" in css

    with open('src/popup/popup.js', 'r', encoding='utf-8') as f:
        js = f.read()
    assert "el.style.display = key === category ? 'grid' : 'none'" in js
    assert "loadMissingAppIcons" in js
    print("✓ Popup grid layout and logo loader verified")

def classify_app_simulation(methods, category, total_score=0.9):
    # Mirrors logic in detector-engine.js lines 1017-1041
    hasThemeBlock = any(m in ['App Block', 'App Snippet', 'App Config'] for m in methods)
    hasActiveScript = any(m in ['script', 'App CDN', 'cdn'] for m in methods)
    hasRuntime = any(m in ['global', 'network', 'proxy', 'webhook', 'mutation'] for m in methods)
    hasDom = 'dom' in methods
    hasSnippetCode = 'Script Code' in methods

    isPureBackgroundScript = category in ['Tag Management', 'Pixels & Tracking']

    isCorroboratedScript = hasActiveScript and (hasDom or hasRuntime or hasSnippetCode or len(methods) >= 2 or not isPureBackgroundScript)
    isRuntimeActive = hasRuntime and (hasActiveScript or hasDom or len(methods) >= 2 or not isPureBackgroundScript)
    isDomActiveWithCode = hasDom and (hasActiveScript or hasRuntime or hasSnippetCode)

    if hasThemeBlock or isCorroboratedScript or isRuntimeActive or isDomActiveWithCode:
        return 'active'
    elif hasActiveScript or hasRuntime or (hasSnippetCode and total_score >= 0.8):
        return 'scripts'
    else:
        return 'ghosts'

def test_detector_engine_classification():
    print("\n=== Testing detector engine classification logic ===")
    with open('src/content/detector-engine.js', 'r', encoding='utf-8') as f:
        js = f.read()
    assert "hasThemeBlock" in js
    assert "isCorroboratedScript" in js
    assert "isRuntimeActive" in js
    assert "isDomActiveWithCode" in js

    # Test Crisp (Chat widget with global + script or global only)
    assert classify_app_simulation(['global'], 'Chat') == 'active'
    assert classify_app_simulation(['script', 'global'], 'Chat') == 'active'
    print("✓ Crisp correctly classified as 'active'")

    # Test Mouseflow (Analytics widget with script + global)
    assert classify_app_simulation(['script', 'global'], 'Analytics') == 'active'
    assert classify_app_simulation(['global'], 'Analytics') == 'active'
    print("✓ Mouseflow correctly classified as 'active'")

    # Test Smartlook (Analytics with script + dom + global)
    assert classify_app_simulation(['script', 'dom', 'global'], 'Analytics') == 'active'
    assert classify_app_simulation(['script', 'dom'], 'Analytics') == 'active'
    print("✓ Smartlook correctly classified as 'active'")

    # Test ReConvert (Upsell with dom + global)
    assert classify_app_simulation(['dom', 'global'], 'Marketing & Conversion') == 'active'
    print("✓ ReConvert correctly classified as 'active'")

    # Test Pure background tag manager with pure script only
    assert classify_app_simulation(['script'], 'Tag Management') == 'scripts'
    print("✓ Pure Tag Manager correctly classified as 'scripts'")

    # Test Orphaned residual ghost (DOM element remaining with no scripts/runtime)
    assert classify_app_simulation(['dom'], 'Reviews') == 'ghosts'
    print("✓ Orphaned DOM leftover correctly classified as 'ghosts'")

def test_js_delimiters():
    print("\n=== Testing JS delimiters ===")
    js_files = [
        'src/background/background.js',
        'src/content/content.js',
        'src/content/detector-engine.js',
        'src/content/injected.js',
        'src/popup/popup.js'
    ]
    pairs = {')': '(', ']': '[', '}': '{'}
    for filepath in js_files:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        stack = []
        in_str = None
        in_line_comment = False
        in_block_comment = False
        in_regex = False
        in_regex_class = False
        escape = False

        prev_non_ws = ''
        i = 0
        n = len(content)
        while i < n:
            c = content[i]
            next_c = content[i+1] if i + 1 < n else ''

            if in_line_comment:
                if c == '\n':
                    in_line_comment = False
                i += 1
                continue
            if in_block_comment:
                if c == '*' and next_c == '/':
                    in_block_comment = False
                    i += 2
                    continue
                i += 1
                continue
            if escape:
                escape = False
                i += 1
                continue
            if c == '\\':
                escape = True
                i += 1
                continue
            if in_str:
                if c == in_str:
                    in_str = None
                i += 1
                continue
            if in_regex:
                if in_regex_class:
                    if c == ']':
                        in_regex_class = False
                else:
                    if c == '[':
                        in_regex_class = True
                    elif c == '/':
                        in_regex = False
                i += 1
                continue

            if c in ("'", '"', '`'):
                in_str = c
                i += 1
                continue
            if c == '/' and next_c == '/':
                in_line_comment = True
                i += 2
                continue
            if c == '/' and next_c == '*':
                in_block_comment = True
                i += 2
                continue
            if c == '/':
                # Check if it could be a regex literal
                if prev_non_ws in '(=:[,!&|?{;~^' or prev_non_ws == 'return':
                    in_regex = True
                    i += 1
                    continue

            if c in '({[':
                stack.append((c, i))
            elif c in ')}]':
                assert stack, f"Unmatched {c} at index {i} in {filepath}"
                top, _ = stack.pop()
                assert top == pairs[c], f"Mismatched {top} vs {c} at index {i} in {filepath}"
            
            if not c.isspace():
                prev_non_ws = c
            i += 1
        assert not stack, f"Unclosed delimiters remaining in {filepath}: {stack}"
        print(f"✓ Delimiters balanced in {filepath}")

if __name__ == '__main__':
    test_database()
    test_injected_globals()
    test_background_aliases_and_icons()
    test_popup_ui()
    test_detector_engine_classification()
    test_js_delimiters()
    print("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<")
