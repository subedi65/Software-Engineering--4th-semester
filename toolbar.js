/**
 * ============================================================================
 * TOOLBAR.JS - Rich Text Editor Formatting Controls
 * ============================================================================
 * This module handles all the formatting toolbar functionality for the editor.
 * It works with the contenteditable div (richEditor) to apply text formatting
 * like bold, italic, underline, alignment, text color, and image insertion.
 *
 * Key Concepts:
 * - execCommand() → Native browser API for contenteditable formatting
 * - Selection & Range → JavaScript APIs to track cursor position
 * - Data URIs → For embedded images in the editor
 * ============================================================================
 */

// Global variable to store the current editor reference
let richEditor = null;

/**
 * Initialize Rich Text Editor
 * Called from renderer.js when DOM is ready
 * Sets up all event listeners for toolbar buttons and editor interactions
 */
function initializeRichText() {
    // Get references to DOM elements
    richEditor = document.getElementById('rich-editor');
    const formatBtns = document.querySelectorAll('.format-btn');
    const textColorPicker = document.getElementById('text-color');
    const insertImageBtn = document.getElementById('insert-image-btn');
    const imageUpload = document.getElementById('image-upload');

    // Only initialize if the editor exists
    if (!richEditor) {
        console.warn('Rich editor not found in DOM');
        return;
    }

    console.log('✅ Rich Text Editor Initialized');

    // ========== FORMATTER BUTTON CLICK HANDLERS ==========
    // Each button uses the data-command attribute to execute a formatting command
    // The execCommand() method is a built-in browser API for contenteditable elements
    formatBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const command = btn.getAttribute('data-command');

            // Focus the editor first to ensure the command is applied to the right element
            richEditor.focus();

            // Execute the formatting command (bold, italic, etc.)
            document.execCommand(command, false, null);

            // Visual feedback - highlight active button if formatting is active
            updateButtonStates();

            console.log(`📝 Applied formatting: ${command}`);
        });
    });

    // ========== TEXT COLOR PICKER HANDLER ==========
    // When user picks a color, apply it to the selected text
    if (textColorPicker) {
        textColorPicker.addEventListener('change', (e) => {
            const color = e.target.value;
            richEditor.focus();
            // foreColor command changes text color
            document.execCommand('foreColor', false, color);
            updateButtonStates();
            console.log(`🎨 Text color changed to: ${color}`);
        });
    }

    // ========== IMAGE INSERT HANDLER ==========
    // Allow users to insert images into the editor
    if (insertImageBtn && imageUpload) {
        insertImageBtn.addEventListener('click', () => {
            imageUpload.click(); // Trigger file input dialog
        });

        imageUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                // Read file as data URI so it's embedded in the content
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imageData = event.target.result;
                    richEditor.focus();

                    // Create an img element with the image data
                    const img = new Image();
                    img.src = imageData;
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    img.style.margin = '10px 0';
                    img.style.borderRadius = '4px';

                    // Insert the image into the editor
                    const range = window.getSelection().getRangeAt(0);
                    range.insertNode(img);
                    range.setStartAfter(img);
                    range.collapse(true);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);

                    console.log(`🖼️ Image inserted: ${file.name}`);
                };
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('❌ Failed to insert image:', error);
            }
        });
    }

    // ========== EDITOR INPUT TRACKING ==========
    // Track when user types in the editor to trigger auto-save
    richEditor.addEventListener('input', () => {
        // Dispatch custom event that renderer.js listens for
        richEditor.dispatchEvent(new Event('contentChanged', { bubbles: true }));
    });

    // ========== KEYBOARD SHORTCUTS ==========
    // Enhance default shortcuts with visual feedback
    richEditor.addEventListener('keydown', (e) => {
        // Ctrl+B for Bold (already works, but we'll add feedback)
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            document.execCommand('bold', false, null);
            updateButtonStates();
        }
        // Ctrl+I for Italic
        if (e.ctrlKey && e.key === 'i') {
            e.preventDefault();
            document.execCommand('italic', false, null);
            updateButtonStates();
        }
        // Ctrl+U for Underline
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
            document.execCommand('underline', false, null);
            updateButtonStates();
        }
    });

    // ========== PASTE HANDLING ==========
    // Ensure pasted content is plain text or clean HTML (prevent unwanted styles)
    richEditor.addEventListener('paste', (e) => {
        e.preventDefault();

        // Get pasted text/HTML
        const text = e.clipboardData.getData('text/plain');

        // Insert as plain text or formatted based on content
        if (e.clipboardData.types.includes('text/html')) {
            const html = e.clipboardData.getData('text/html');
            // Use insertHTML to preserve some formatting if needed
            document.execCommand('insertHTML', false, html);
        } else {
            // Plain text insertion
            document.execCommand('insertText', false, text);
        }

        console.log('📋 Content pasted');
    });
}

/**
 * Update Button States to Show Active Formatting
 * Makes buttons appear pressed/highlighted when that formatting is active at cursor position
 * This provides visual feedback to the user
 */
function updateButtonStates() {
    const formatBtns = document.querySelectorAll('.format-btn');

    formatBtns.forEach(btn => {
        const command = btn.getAttribute('data-command');

        // Check if this formatting is currently active
        const isActive = document.queryCommandState(command);

        if (isActive) {
            btn.classList.add('active');
            btn.style.background = 'var(--item-active)';
            btn.style.borderColor = '#316357';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.borderColor = 'transparent';
        }
    });
}

/**
 * Get the HTML content from the rich editor
 * @returns {string} The formatted HTML content
 */
function getRichEditorContent() {
    if (!richEditor) return '';
    return richEditor.innerHTML;
}

/**
 * Set the HTML content in the rich editor
 * @param {string} htmlContent - The HTML content to display
 */
function setRichEditorContent(htmlContent) {
    if (!richEditor) return;
    richEditor.innerHTML = htmlContent;
}

/**
 * Get plain text from the rich editor (strips HTML tags)
 * @returns {string} Plain text content
 */
function getRichEditorPlainText() {
    if (!richEditor) return '';
    return richEditor.innerText;
}

/**
 * Clear the rich editor content
 */
function clearRichEditor() {
    if (!richEditor) return;
    richEditor.innerHTML = '';
    richEditor.focus();
}

/**
 * Focus the rich editor
 */
function focusRichEditor() {
    if (!richEditor) {
        richEditor = document.getElementById('rich-editor');
    }
    if (richEditor) {
        richEditor.focus();
    }
}

// Log initialization
console.log('📚 toolbar.js loaded - Rich text editor module ready');
