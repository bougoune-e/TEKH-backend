import csv
import re
import unicodedata
import sys

def normalize_header(header):
    # Normalize unicode characters
    nfkd_form = unicodedata.normalize('NFKD', header)
    # Filter out non-spacing mark characters
    no_accents = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    # Convert to lowercase
    lower = no_accents.lower()
    # Remove parentheses
    cleaned = lower.replace('(', '').replace(')', '')
    # Replace non-alphanum with space
    cleaned = re.sub(r'[^a-z0-9]', ' ', cleaned)
    # Collapse whitespace to single underscore
    cleaned = '_'.join(cleaned.split())
    return cleaned

def clean_number(value):
    """Removes non-digit characters from a string."""
    if not value:
        return ""
    return re.sub(r'[^0-9]', '', value)

input_file = 'src/api/tab.csv'
output_file = 'src/api/tab_cleaned.csv'

# Define columns that should be treated as numeric (indices will be determined dynamically)
# 'prix_neuf_en_fcfa' needs strict "only digits" cleaning.
# Others might just need "0 if empty".
numeric_cols_names = ['prix_neuf_en_fcfa', 'stockages_gb', 'ram_gb', 'annee_sortie']

print(f"Reading from {input_file}...")

try:
    with open(input_file, 'r', encoding='utf-8') as f_in:
        reader = csv.reader(f_in)
        try:
            headers = next(reader)
        except StopIteration:
            print("Error: Empty file")
            sys.exit(1)
            
        # Normalize headers
        new_headers = [normalize_header(h) for h in headers]
        print(f"Original Headers: {headers}")
        print(f"New Headers: {new_headers}")

        # unexpected_cols logic
        if len(new_headers) != len(set(new_headers)):
             print("Warning: Duplicate headers found after normalization.")

        # Identify indices for numeric columns
        col_indices = {}
        for col_name in numeric_cols_names:
            try:
                # Find matching header (exact match after normalization)
                idx = new_headers.index(col_name)
                col_indices[col_name] = idx
            except ValueError:
                 # Check if maybe it's close? e.g. "stockage_gb" vs "stockages_gb"
                 # But based on file check, exact names seem to be:
                 # marques,modele_exact,stockages_gb,prix_neuf_en_fcfa,classe_equivalence,ram_gb,annee_sortie
                 pass
        
        print(f"Identified numeric columns indices: {col_indices}")

        rows = []
        expected_cols = len(new_headers)
        
        for i, row in enumerate(reader, start=2):
            # Handle row length
            if len(row) != expected_cols:
                print(f"Warning: Line {i} has {len(row)} columns, expected {expected_cols}. Skipping/Fixing integrity.")
                # We can try to trim if too long (e.g. trailing empty) or pad if too short?
                # For safety, let's just warn and if close, valid.
                # If we want to guarantee structure, we must ensure len matches.
                # If too short, pad with empty.
                if len(row) < expected_cols:
                    row += [''] * (expected_cols - len(row))
                elif len(row) > expected_cols:
                    # check if extra columns are empty
                    if all(x.strip() == '' for x in row[expected_cols:]):
                         row = row[:expected_cols]
                    else:
                        print(f"  -> Data lost in extra columns: {row[expected_cols:]}")
                        row = row[:expected_cols]

            # Process columns
            cleaned_row = list(row)
            
            # Special handling for prix_neuf_en_fcfa: remove non-digits
            if 'prix_neuf_en_fcfa' in col_indices:
                idx = col_indices['prix_neuf_en_fcfa']
                original_val = cleaned_row[idx]
                # Remove everything that is not a digit
                cleaned_val = clean_number(original_val)
                # "Si une cellule numérique est vide, remplace-la par '0'"
                if not cleaned_val:
                    cleaned_val = '0'
                cleaned_row[idx] = cleaned_val

            # Handle other numeric columns "empty -> 0"
            for col_name, idx in col_indices.items():
                if col_name == 'prix_neuf_en_fcfa':
                    continue # Already handled
                
                val = cleaned_row[idx].strip()
                # If empty, set to 0
                if not val:
                    cleaned_row[idx] = '0'
                # Attempt to clean partial numeric garbage if desired?
                # User said: "Dans les colonnes de prix ... supprime tout ce qui n'est pas un chiffre"
                # For others? "Si une cellule numérique est vide..."
                # It implies we should treat them as numeric cells.
                # But notice 'ram_gb' has "8 GB". If I strip non-digits, I get "8". That's probably better for Supabase INT/BIGINT.
                # Let's be safe and strip non-digits for 'ram_gb' and 'stockages_gb' too if they contain mix.
                # But 'modele_exact' might have numbers. We only target specific columns.
                
                # Check strict requirements: "Dans les colonnes de prix ...".
                # "Gestion des vides : Si une cellule numérique est vide...".
                # Implicitly, for DB import, numbers should be numbers.
                # Let's clean RAM and Storage too if they look like "8 GB".
                if col_name in ['ram_gb', 'stockages_gb']:
                     # If it has digits, keep only digits?
                     # What if it's "1TB"? -> 1.
                     # "8 GB" -> 8.
                     # Seems safe for these columns in this context.
                     digit_cleaned = clean_number(val)
                     if digit_cleaned:
                         cleaned_row[idx] = digit_cleaned
                     else:
                         # If it was just text or empty
                         if not val:
                             cleaned_row[idx] = '0'
                         # If it was "N/A" -> becomes empty -> 0.
            
            rows.append(cleaned_row)

    with open(output_file, 'w', encoding='utf-8', newline='') as f_out:
        writer = csv.writer(f_out, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(new_headers)
        writer.writerows(rows)

    print(f"Success: Processed {len(rows)} rows. Output written to {output_file}")

except FileNotFoundError:
    print(f"Error: File {input_file} not found.")
    sys.exit(1)
except Exception as e:
    print(f"An unexpected error occurred: {e}")
    sys.exit(1)
