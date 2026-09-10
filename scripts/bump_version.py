import sys
import re

def bump_version(old_version, bump_type):
    major, minor, patch = map(int, old_version.split('.'))
    if bump_type == 'major':
        return f"{major + 1}.0.0"
    elif bump_type == 'minor':
        return f"{major}.{minor + 1}.0"
    else:
        return f"{major}.{minor}.{patch + 1}"

def update_file(path, pattern, replacement):
    try:
        with open(path, 'r') as f:
            content = f.read()
        new_content = re.sub(pattern, replacement, content)
        with open(path, 'w') as f:
            f.write(new_content)
        print(f"  Updated {path}")
    except FileNotFoundError:
        print(f"  Skipped {path} (not found)")
    except Exception as e:
        print(f"  Error updating {path}: {e}")

def main():
    pkg_path = "package.json"
    with open(pkg_path, 'r') as f:
        content = f.read()
    match = re.search(r'"version"\s*:\s*"(.*?)"', content)
    if not match:
        print("Version not found in package.json")
        sys.exit(1)

    current_version = match.group(1)
    bump_type = sys.argv[1] if len(sys.argv) > 1 else 'patch'
    new_version = bump_version(current_version, bump_type)

    print(f"Bumping aigod from {current_version} to {new_version}...")

    update_file("package.json", r'"version"\s*:\s*".*?"', f'"version": "{new_version}"')
    update_file("docker-compose.yml", r'\$\{TAG:-[^}]+\}', f'${{TAG:-{new_version}}}')

    print(f"\nAll version references updated to {new_version}")

if __name__ == '__main__':
    main()