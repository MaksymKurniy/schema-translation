import json
import os
import re
import tkinter as tk
from tkinter import filedialog

def load_input_liquid():
    root = tk.Tk()
    root.withdraw()
    file_paths = filedialog.askopenfilenames(filetypes=[("Liquid files", "*.liquid")])

    if not file_paths:
        print("No file selected. Exiting.")
        exit()

    json_from_liquid_list = [extract_json_from_liquid(file_path) for file_path in file_paths]

    if not any(json_from_liquid_list):
        print("No {% schema %} found in the selected Liquid files. Exiting.")
        exit()

    filenames = [os.path.splitext(os.path.basename(file_path))[0] for file_path in file_paths]
    work_folder = os.path.abspath(os.path.join(file_paths[0], "../.."))

    return json_from_liquid_list, filenames, work_folder

def extract_json_from_liquid(liquid_file):
    with open(liquid_file, 'r') as file:
        content = file.read()
        start = re.search(r'{%\s*schema\s*%}', content)
        end = re.search(r'{%\s*endschema\s*%}', content)

        if start is not None and end is not None:
            start_idx = start.start() + len(start.group(0))
            schema_content = content[start_idx:end.start()].strip()
            return json.loads(schema_content)
    return None

def replace_in_liquid(liquid_file_path, input_json):
    try:
        with open(liquid_file_path, 'r') as liquid_file:
            liquid_content = liquid_file.read()

        replacement = f"{{% schema %}}\n{json.dumps(input_json, indent=2)}\n{{% endschema %}}"
        new_liquid_content = re.sub(r'{%\s*schema\s*%}.*?{%\s*endschema\s*%}', replacement, liquid_content, flags=re.DOTALL)

        with open(liquid_file_path, 'w') as liquid_file:
            liquid_file.write(new_liquid_content)
    except Exception as e:
        print(f'\033[91m{liquid_file_path} has error: {e}\033[0m')

def find_similar_label_path(target_label):
    def recursive_search(current_path, current_value):
        nonlocal result
        if isinstance(current_value, dict):
            for key, value in current_value.items():
                path = f"{current_path}.{key}" if current_path else key
                recursive_search(path, value)
                if result:
                    return
        elif isinstance(current_value, str) and current_value.lower() == target_label.lower():
            result = current_path

    result = None
    global dictionary
    recursive_search("", dictionary)
    return result

def load_json_by_path(json_file_path, target_path):
    with open(json_file_path, 'r') as json_file:
        data = json.load(json_file)
        path_elements = target_path.split('.')
        for element in path_elements:
            data = data.get(element, {})
            if not data:
                break
        return data

def gen_locale(input_json, filename):
    def update_locale(setting, locale_path):
        nonlocal type_idx
        setting_id = setting.get('id', f"{setting.get('type')}__{type_idx}")
        locale_path[setting_id] = {}

        for opt in select_opt:
            if opt in setting and not setting[opt].startswith("t:"):
                if find_similar_label_path(setting[opt]):
                    continue
                locale_path[setting_id][opt] = setting[opt]
        if 'options' in setting:
            for idx, option in enumerate(setting['options'], start=1):
                if 'label' in option and not option['label'].startswith("t:") and not option['label'].isdigit():
                    if find_similar_label_path(option['label']):
                        continue
                    locale_path[setting_id][f"options__{idx}"] = {"label": option['label']}

    def update_schema(setting, path):
        nonlocal type_idx
        setting_id = setting.get('id', f"{setting.get('type')}__{type_idx}")

        for opt in select_opt:
            if opt in setting and not setting[opt].startswith("t:"):
                all_path = find_similar_label_path(setting[opt])
                setting[opt] = f"{path}.settings.{setting_id}.{opt}" if all_path is None else f"t:sections.all.{all_path}"

                if 'content' in opt:
                    type_idx += 1
        if 'options' in setting:
            for idx, option in enumerate(setting['options'], start=1):
                if 'label' in option and not option['label'].startswith("t:") and not option['label'].isdigit():
                    all_path = find_similar_label_path(option['label'])
                    option['label'] = f"{path}.settings.{setting['id']}.options__{idx}.label" if all_path is None else f"t:sections.all.{all_path}"
    type_idx = 1
    if "section-" in filename:
        filename = filename.replace("section-", "")
    translation = {"settings": {}, "blocks": {}}
    if 'name' in input_json and not input_json['name'].startswith("t:") :
        translation['name'] = input_json['name']
        input_json['name'] = f"t:sections.{filename}.name"

    for preset in input_json.get('presets', []):
        if 'name' in preset and not preset['name'].startswith("t:"):
            preset['name'] = input_json['name']

    for setting in input_json.get('settings', []):
        update_locale(setting, translation["settings"])
        update_schema(setting, f"t:sections.{filename}")

    for block in input_json.get('blocks', []):
        if '@app' in block['type']:
            continue

        translation["blocks"][block['type']] = {"name": block['name'], "settings": {}}
        if 'name' in block and not block['name'].startswith("t:"):
            block['name'] = f"t:sections.{filename}.blocks.{block['type']}.name"

        for setting in block.get('settings', []):
            update_locale(setting, translation["blocks"][block['type']]["settings"])
            update_schema(setting, f"t:sections.{filename}.blocks.{block['type']}")

    return { "sections": { filename: translation }}

def del_empty_objects(json_data):
    if isinstance(json_data, dict):
        for key, value in list(json_data.items()):
            if isinstance(value, (dict, list)):
                del_empty_objects(value)
            if value in (None, "", [], {}):
                del json_data[key]
    elif isinstance(json_data, list):
        for item in json_data:
            del_empty_objects(item)
            if item in (None, "", [], {}):
                json_data.remove(item)

def add_translations(json_file_path, new_locale):
    try:
        with open(json_file_path, 'r') as json_file:
            existing_locale = json.load(json_file)
    except FileNotFoundError:
        existing_locale = {}

    def recursive_add(target, source):
        for key, value in source.items():
            if isinstance(value, dict):
                target[key] = recursive_add(target.get(key, {}), value)
            elif key not in target:
                target[key] = value
        return target

    del_empty_objects(new_locale)
    updated_translations = recursive_add(existing_locale, new_locale)

    with open(json_file_path, 'w') as json_file:
        json.dump(updated_translations, json_file, indent=2)

def main():
    input_json_list, filename_list, work_folder = load_input_liquid()
    global dictionary
    dictionary_path = f'{work_folder}/locales/en.default.schema.json'
    dictionary = load_json_by_path(dictionary_path, 'sections.all')

    for i, input_json in enumerate(input_json_list):
        if input_json is None:
            continue
        add_translations(dictionary_path, gen_locale(input_json, filename_list[i]))
        replace_in_liquid(f'{work_folder}/sections/{filename_list[i]}.liquid', input_json)

select_opt = ['label', 'info', 'content' ]
dictionary = {}

if __name__ == "__main__":
    main()
