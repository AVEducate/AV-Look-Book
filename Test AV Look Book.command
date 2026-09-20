#!/bin/bash
# AV Look Book — TEST COPY launcher (Mac). Double-click this file.
#
# It opens the desktop app straight from this folder, using the page in deploy/lookbook_builder.html, which is where
# every change is made before users get it. Nothing here touches the installed AV Look Book or its saved shows: the
# test copy keeps its own settings and recents in a separate folder (av-look-book-dev).
#
# Users only ever receive a change after a full release is tagged on GitHub. This file never does that.
cd "$(dirname "$0")/electron" || { echo "Could not find the electron folder next to this file."; read -r -p "Press Return to close."; exit 1; }
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v npm >/dev/null 2>&1; then echo "Node.js is not installed, so the test copy cannot start."; read -r -p "Press Return to close."; exit 1; fi
if [ ! -x node_modules/.bin/electron ]; then echo "First run: installing the desktop shell's parts (one time)…"; npm install || { read -r -p "Install failed. Press Return to close."; exit 1; }; fi
STAMP=$(grep -o 'build 2026-06-16[a-z][a-z0-9]*' ../deploy/lookbook_builder.html | head -1)
echo "Opening the TEST copy of AV Look Book — $STAMP"
echo "(Check the same build stamp at the bottom right of the app window. Close the app window to finish.)"
npm start
