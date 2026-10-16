"""Fail if any programs/*.xml is missing or not well-formed XML."""
import glob
import sys
import xml.etree.ElementTree as ET

files = sorted(glob.glob("programs/*.xml"))
if not files:
    sys.exit("no program files found")
for f in files:
    ET.parse(f)
print(len(files), "program files ok")
