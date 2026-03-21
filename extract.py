import pdfplumber

text = ''
with pdfplumber.open('StreamTogether_PRD.pdf') as pdf:
    for page in pdf.pages:
        text += page.extract_text() + '\n'

with open('StreamTogether_PRD.md', 'w', encoding='utf-8') as f:
    f.write(text)
