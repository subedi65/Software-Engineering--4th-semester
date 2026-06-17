/**
 * ============================================================================
 * TOOLBAR.JS - Rich Text Editor Helper Functions
 * ============================================================================
 * This module provides helper functions for the rich text editor (contenteditable div)
 * and handles all formatting button functionality.
 * ============================================================================
 */

// Get reference to the rich editor element
const richEditor = document.getElementById('rich-editor');

/**
 * Gets the HTML content of the rich editor
 */
function getRichEditorContent() {
    if (!richEditor) {
        console.warn('⚠️ Rich editor element not found');
        return '';
    }
    return richEditor.innerHTML;
}

/**
 * Gets the plain text content of the rich editor (strips HTML tags)
 */
function getRichEditorPlainText() {
    if (!richEditor) {
        console.warn('⚠️ Rich editor element not found');
        return '';
    }
    return richEditor.innerText || richEditor.textContent || '';
}

/**
 * Sets the HTML content of the rich editor
 */
function setRichEditorContent(htmlContent) {
    if (!richEditor) {
        console.warn('⚠️ Rich editor element not found');
        return;
    }
    richEditor.innerHTML = htmlContent;
    // Trigger a contentChanged event so the auto-save debouncer knows content was modified
    document.dispatchEvent(new CustomEvent('contentChanged'));
}

/**
 * Clears all content from the rich editor
 */
function clearRichEditor() {
    if (!richEditor) {
        console.warn('⚠️ Rich editor element not found');
        return;
    }
    richEditor.innerHTML = '';
    richEditor.focus();
    document.dispatchEvent(new CustomEvent('contentChanged'));
}

/**
 * Sets focus to the rich editor
 */
function focusRichEditor() {
    if (!richEditor) {
        console.warn('⚠️ Rich editor element not found');
        return;
    }
    richEditor.focus();
}

/**
 * Inserts text at the current cursor position in the rich editor
 * Used by voice dictation to insert transcribed text
 */
function insertTextAtCursor(text) {
    if (!richEditor) {
        console.warn('⚠️ Rich editor element not found');
        return;
    }

    richEditor.focus();
    const selection = window.getSelection();

    if (selection.rangeCount === 0) {
        // No selection, append to end
        richEditor.innerHTML += text;
        return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor after inserted text
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    // Trigger contentChanged event for auto-save
    document.dispatchEvent(new CustomEvent('contentChanged'));
}

/**
 * Initialize the rich text toolbar functionality
 */
function initializeRichText() {
    console.log('🔧 Initializing Rich Text Toolbar...');

    // Get all formatting buttons from the toolbar
    const formatBtns = document.querySelectorAll('.format-btn');
    const textColorInput = document.getElementById('text-color');
    const insertImageBtn = document.getElementById('insert-image-btn');
    const imageUpload = document.getElementById('image-upload');

    // ===== FORMAT BUTTON HANDLERS =====
    formatBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const command = btn.getAttribute('data-command');
            document.execCommand(command, false, null);
            richEditor?.focus();
            updateActiveButtons();
        });
    });

    // ===== TEXT COLOR PICKER =====
    if (textColorInput) {
        textColorInput.addEventListener('change', (e) => {
            const color = e.target.value;
            document.execCommand('foreColor', false, color);
            richEditor?.focus();
        });
    }

    // ===== IMAGE INSERT FUNCTIONALITY =====
    if (insertImageBtn && imageUpload) {
        insertImageBtn.addEventListener('click', () => {
            imageUpload.click();
        });

        imageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.createElement('img');
                img.src = event.target.result;
                img.style.maxWidth = '100%';
                img.style.borderRadius = '4px';
                img.style.margin = '10px 0';

                // Insert image at current cursor position
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    range.insertNode(img);
                    range.setStartAfter(img);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }

                richEditor?.focus();
                document.dispatchEvent(new CustomEvent('contentChanged'));
            };
            reader.readAsDataURL(file);

            // Reset file input so same file can be uploaded again
            imageUpload.value = '';
        });
    }

    // ===== UPDATE ACTIVE BUTTON STATES =====
    function updateActiveButtons() {
        formatBtns.forEach(btn => {
            const command = btn.getAttribute('data-command');
            const isActive = document.queryCommandState(command);
            if (isActive) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Update active buttons when selection changes
    document.addEventListener('selectionchange', updateActiveButtons);
    richEditor?.addEventListener('input', updateActiveButtons);
    richEditor?.addEventListener('click', updateActiveButtons);

    // Dispatch contentChanged event when content is modified
    richEditor?.addEventListener('input', () => {
        document.dispatchEvent(new CustomEvent('contentChanged'));
    });

    console.log('✅ Rich Text Toolbar initialized successfully');
}

// Wait for DOM to load if toolbar.js is loaded before DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRichText);
} else {
    // If DOM is already loaded when this script runs, initialize immediately
    initializeRichText();
}
