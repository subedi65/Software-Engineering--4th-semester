# 📝 Quick Note Taker


---

## 👥 Group Identification & Contribution Matrix
**Group Number:** -2

| # | Full Name | Student ID | Core Contribution / Feature Responsibility |
|---|---|---|---|
| 1 | **Subedi Prabesh** | 202491216 | Technical Lead & Architecture Engineer <br> *Engineered the dynamic Multi-Window Pop-out Pipeline.* |
| 2 | **Neupane Himmat** | 2024791145 | Core System Developer <br> Text Formatting | Undo Redo | Insert Media |
| 3 | **Roy Amit** | 20248911741 | Core System Developer <br> *[Insert Core Feature Title Here]* |
| 4 | **Kc Shashank** | 2024591089 | Core System Developer <br> *[Insert Core Feature Title Here]* |
| 5 | **Pariyar Prabin** | 2024991102 | Core System Developer <br> *[Insert Core Feature Title Here]* |

---

## 🔬 Deep-Dive Feature Spotlight: Dynamic Multi-Window Architecture
*(Authored by Subedi Prabesh — ID: 202491216)*

> [!NOTE]
> **Architectural Paradigm Shift**
> Because Electron strictly separates environments for security, a sandboxed UI window cannot directly spawn other browser instances. All window orchestration tasks must be securely elevated to the Node.js root thread.

In our Electron application, opening a note in a separate window relies on a secure handshake between the sandboxed Renderer Process (frontend UI) and the Main Process (backend Node.js environment). When a user clicks the pop-out button, the renderer captures the note's text and metadata, immediately passing it across a secure bridge via `window.electronAPI.openSeparateWindow(note)`. The Main process intercepts this Inter-Process Communication (IPC) event, instantiates a brand-new `BrowserWindow`, and maps that specific window's native ID to the note's data payload inside a global backend collection (`detachedWindowsMap`). As this new window loads up its fresh user interface, it sends a synchronous inquiry back to the backend asking `get-popout-data` to discover its identity; the Main process identifies the calling window's ID, retrieves the corresponding note, and pushes it back to the frontend. Finally, a clever CSS chameleon trick takes place: the newly spawned renderer detects this data payload, forces the app's standard layout sidebar to hide using `style.display = 'none'`, and transforms a heavy, multi-panel desktop application into an isolated, distraction-free auxiliary note sheet.

---

## 🔬 Deep-Dive Feature Spotlight: [Note Text Formatting]
*(Authored by Neupane Himmat — ID: 2024791145)*

> [!NOTE]
> **Feature Overview**
> *I have added text content formatting and styling capabilities to undo/redo and media insertion.*

In the frontend, instead of using plain regular textarea, i have created my own custom textarea as (toolbar.html). This features enable user to add text in different format. I have given feature of making the text bold, and italic and underlined, these buttons format the text in different style making easy to highlight the important part in the note. Along with this, we have features to change the color of selected part of text or character which enables extra highlight the text paragraphs and notes, 
 
 Then another feature is to insert the image in note editor, we can pick any images from the local storage and insert into our note,

 finally, i have implemented  undo redo functions that helps to hide your mistakes. 

---

## 🔬 Deep-Dive Feature Spotlight: [Insert Member 3 Feature Title]
*(Authored by Roy Amit — ID: 20248911741)*

> [!NOTE]
> **Feature Overview**
> *[Member 3: Replace this text with a short summary sentence of your feature's technical impact or core system change.]*

[Member 3: Paste your detailed engineering paragraph here explaining how your feature works behind the scenes, referencing specific backend or frontend mechanisms.]

---

## 🔬 Deep-Dive Feature Spotlight: [Insert Member 4 Feature Title]
*(Authored by Kc Shashank — ID: 2024591089)*

> [!NOTE]
> **Feature Overview**
> *[Member 4: Replace this text with a short summary sentence of your feature's technical impact or core system change.]*

[Member 4: Paste your detailed engineering paragraph here explaining how your feature works behind the scenes, referencing specific backend or frontend mechanisms.]

---

## 🔬 Deep-Dive Feature Spotlight: [Insert Member 5 Feature Title]
*(Authored by Pariyar Prabin — ID: 2024991102)*

> [!NOTE]
> **Feature Overview**
> *[Member 5: Replace this text with a short summary sentence of your feature's technical impact or core system change.]*

[Member 5: Paste your detailed engineering paragraph here explaining how your feature works behind the scenes, referencing specific backend or frontend mechanisms.]

---

## 📁 Repository Directory Structure

quick-note-taker/
├── dist/                     # Generated Windows Installer (.exe binaries)
├── main.js                   # Application Core Process & Lifecycle Manager
├── preload.js                # Secure Context Bridge Gateway (IPC channels)
├── renderer.js               # Application Layout UI Runtime Controller
├── index.html                # Native Chromium Web Page View Framework
├── menutempelate.js          # App System Application Toolbar Blueprint
├── package.json              # App Dependency manifests & Build Blueprint
└── README.md                 # Project Technical Overview Documentation


---

## 📄 App Description
This application is a lightweight, secure, and highly organized desktop text and markdown editor built using Electron. It provides an optimized, local notebook environment designed for quick thought capture, organized categorizing, and fluent writing.

### Core Features:
* **Dynamic Note Management:** Create, auto-save, and manage notes from a unified sidebar. You can pin important notes to the top of your list so they never get lost.
* **Custom Color-Coded Tags:** Organize your workspace using vibrant, color-coded category badges (like Work, Personal, Ideas, and To-Do) to easily differentiate types of content.
* **Real-Time Search & Filters:** Instantly find notes using a lightning-fast keyword search bar combined with a drop-down category filter to narrow down your list.
* **Isolated Multi-Window Editing:** Open any note into a separate, distraction-free pop-out window. The app intelligently hides the sidebar layout in these sub-windows, turning them into focused, single-sheet writing spaces.
* **Enhanced Usability Tools:** Includes standard real-time word/character counters, accessibility font-scaling adjustments (A+ and A-), protective "unsaved change" safety prompts, a fully custom menubar interface, and system-native tray residency so the app can run discreetly in your taskbar background.
* **Local Data & Personalization:** All notes and application configuration choices (like your font size preference or a saved Light/Dark theme toggle) persist directly on your machine through secure, local storage files rather than an external cloud.

---

## 🚀 How to Run the App

1. **Install Node.js** ➔ Download & install from https://nodejs.org
2. **Open Terminal** ➔ Open project folder: `cd path/to/quick-note-taker`
3. **Install Dependencies** ➔ Run: `npm install`
4. **Launch the App** ➔ Run: `npm start`

---

## 📦 How to Install the App 

1. **Locate Installer** ➔ Go to the project folder and open the `/dist` directory
2. **Launch Setup** ➔ Double-click `Quick Note Taker Setup 1.0.0.exe`
3. **Follow Wizard** ➔ Complete the step-by-step native Windows installation wizard
4. **Run Application** ➔ Launch the app using the new Desktop shortcut or from your Start Menu