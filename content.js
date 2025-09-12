(function() {
    'use strict';
    
    // Prevent multiple injections
    if (window.__PLAYWRIGHT_LOCATOR_FINDER) {
        console.log('Playwright Locator Finder already active');
        return;
    }
    
    window.__PLAYWRIGHT_LOCATOR_FINDER = true;
    
    let isActive = false;
    let currentHighlight = null;
    let evaluatorWindow = null;
    let matchedElements = [];
    
    // Create styles
    const style = document.createElement('style');
    style.textContent = `
        .plf-highlight {
            outline: 3px solid #ff6b35 !important;
            outline-offset: 2px !important;
            background-color: rgba(255, 107, 53, 0.1) !important;
            cursor: crosshair !important;
        }
        
        .plf-match {
            outline: 3px solid #4caf50 !important;
            outline-offset: 2px !important;
            background-color: rgba(76, 175, 80, 0.1) !important;
        }
        
        .plf-evaluator {
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            left: auto !important;
            bottom: auto !important;
            width: 350px !important;
            height: auto !important;
            background: white !important;
            border: 2px solid #2196f3 !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            font-size: 14px !important;
            user-select: none !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
        }
        
        .plf-evaluator * {
            box-sizing: border-box !important;
        }
        
        .plf-header {
            background: #2196f3 !important;
            color: white !important;
            padding: 12px 15px !important;
            border-radius: 6px 6px 0 0 !important;
            font-weight: bold !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            cursor: move !important;
            user-select: none !important;
        }
        
        .plf-header:hover {
            background: #1976d2 !important;
        }
        
        .plf-drag-handle {
            font-size: 12px !important;
            opacity: 0.7 !important;
            margin-left: 10px !important;
        }
        
        .plf-close {
            background: none !important;
            border: none !important;
            color: white !important;
            font-size: 18px !important;
            cursor: pointer !important;
            padding: 0 !important;
            width: 24px !important;
            height: 24px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        
        .plf-content {
            padding: 15px !important;
        }
        
        .plf-textarea {
            width: 100% !important;
            height: 120px !important;
            border: 1px solid #ddd !important;
            border-radius: 4px !important;
            padding: 8px !important;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
            font-size: 12px !important;
            resize: vertical !important;
            margin-bottom: 10px !important;
        }
        
        .plf-buttons {
            display: flex !important;
            gap: 8px !important;
            margin-bottom: 10px !important;
        }
        
        .plf-button {
            padding: 8px 12px !important;
            border: none !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-size: 12px !important;
            font-weight: 500 !important;
        }
        
        .plf-button-primary {
            background: #2196f3 !important;
            color: white !important;
        }
        
        .plf-button-secondary {
            background: #f5f5f5 !important;
            color: #333 !important;
        }
        
        .plf-results {
            background: #f8f9fa !important;
            border: 1px solid #e9ecef !important;
            border-radius: 4px !important;
            padding: 10px !important;
            font-size: 12px !important;
            min-height: 40px !important;
        }
        
        .plf-textarea {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
            line-height: 1.4 !important;
        }
        
        .plf-unique-indicator {
            color: #28a745 !important;
            font-weight: bold !important;
        }
        
        .plf-multiple-indicator {
            color: #ffc107 !important;
            font-weight: bold !important;
        }
    `;
    document.head.appendChild(style);
    
    // Utility functions
    function clearHighlights() {
        if (currentHighlight) {
            currentHighlight.classList.remove('plf-highlight');
            currentHighlight = null;
        }
        matchedElements.forEach(el => el.classList.remove('plf-match'));
        matchedElements = [];
    }
    
    function highlightElement(element) {
        clearHighlights();
        if (element && element !== document.body && element !== document.documentElement) {
            element.classList.add('plf-highlight');
            currentHighlight = element;
        }
    }
    
    function getElementRole(element) {
        const explicitRole = element.getAttribute('role');
        if (explicitRole) return explicitRole;
        
        const tagName = element.tagName.toLowerCase();
        const roleMap = {
            'button': 'button',
            'a': 'link',
            'input': element.type === 'button' || element.type === 'submit' ? 'button' : 'textbox',
            'textarea': 'textbox',
            'select': 'combobox',
            'h1': 'heading',
            'h2': 'heading',
            'h3': 'heading',
            'h4': 'heading',
            'h5': 'heading',
            'h6': 'heading',
            'img': 'img',
            'nav': 'navigation',
            'main': 'main',
            'article': 'article',
            'section': 'region'
        };
        
        return roleMap[tagName] || null;
    }
    
    function isLocatorUnique(locatorString, targetElement) {
        try {
            let elements = [];
            
            if (locatorString.includes('getByTestId')) {
                const match = locatorString.match(/getByTestId\(['"]([^'"]+)['"]\)/);
                if (match) {
                    elements = Array.from(document.querySelectorAll(`[data-testid="${match[1]}"]`));
                }
            } else if (locatorString.includes('getByRole')) {
                const match = locatorString.match(/getByRole\(['"]([^'"]+)['"](?:,\s*{\s*name:\s*['"]([^'"]+)['"]\s*})?\)/);
                if (match) {
                    const [, role, name] = match;
                    elements = Array.from(document.querySelectorAll('*')).filter(el => {
                        const elRole = getElementRole(el);
                        if (elRole !== role) return false;
                        if (name) {
                            return el.textContent?.trim() === name;
                        }
                        return true;
                    });
                }
            } else if (locatorString.includes('getByText')) {
                const match = locatorString.match(/getByText\(['"]([^'"]+)['"]\)/);
                if (match) {
                    const text = match[1];
                    elements = Array.from(document.querySelectorAll('*')).filter(el => 
                        el.textContent?.trim() === text
                    );
                }
            } else if (locatorString.includes('getByLabel')) {
                const match = locatorString.match(/getByLabel\(['"]([^'"]+)['"]\)/);
                if (match) {
                    const labelText = match[1];
                    const labels = Array.from(document.querySelectorAll('label')).filter(label =>
                        label.textContent?.trim() === labelText
                    );
                    elements = labels.map(label => {
                        const forId = label.getAttribute('for');
                        return forId ? document.getElementById(forId) : label.querySelector('input, select, textarea');
                    }).filter(Boolean);
                }
            } else if (locatorString.includes('getByPlaceholder')) {
                const match = locatorString.match(/getByPlaceholder\(['"]([^'"]+)['"]\)/);
                if (match) {
                    elements = Array.from(document.querySelectorAll(`[placeholder="${match[1]}"]`));
                }
            } else if (locatorString.includes('getByAltText')) {
                const match = locatorString.match(/getByAltText\(['"]([^'"]+)['"]\)/);
                if (match) {
                    elements = Array.from(document.querySelectorAll(`[alt="${match[1]}"]`));
                }
            } else if (locatorString.includes('getByTitle')) {
                const match = locatorString.match(/getByTitle\(['"]([^'"]+)['"]\)/);
                if (match) {
                    elements = Array.from(document.querySelectorAll(`[title="${match[1]}"]`));
                }
            } else {
                // CSS selector
                elements = Array.from(document.querySelectorAll(locatorString));
            }
            
            return elements.length === 1 && elements[0] === targetElement;
        } catch (error) {
            return false;
        }
    }

    function generateCSSSelector(element) {
        try {
            if (element.id) {
                const idSelector = `#${element.id}`;
                if (isLocatorUnique(idSelector, element)) {
                    return idSelector;
                }
            }
            
            const path = [];
            let current = element;
            
            while (current && current !== document.body && current !== document.documentElement) {
                let selector = current.tagName ? current.tagName.toLowerCase() : 'unknown';
                
                if (current.id) {
                    selector += `#${current.id}`;
                    path.unshift(selector);
                    break;
                }
                
                // Handle className safely
                try {
                    let classNames = [];
                    if (current.className) {
                        if (typeof current.className === 'string') {
                            classNames = current.className.split(' ').filter(c => c.trim());
                        } else if (current.className.baseVal) {
                            // Handle SVG elements with SVGAnimatedString className
                            classNames = current.className.baseVal.split(' ').filter(c => c.trim());
                        } else if (current.className.animVal) {
                            // Another SVG className variant
                            classNames = current.className.animVal.split(' ').filter(c => c.trim());
                        }
                    }
                    
                    if (classNames.length > 0) {
                        // Escape CSS class names and filter out invalid ones
                        const validClasses = classNames.filter(c => /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(c));
                        if (validClasses.length > 0) {
                            selector += '.' + validClasses.join('.');
                        }
                    }
                } catch (classError) {
                    console.warn('Error processing className:', classError);
                }
                
                // Add nth-child if needed for uniqueness
                try {
                    if (current.parentNode && current.parentNode.children) {
                        const siblings = Array.from(current.parentNode.children).filter(
                            sibling => sibling.tagName === current.tagName
                        );
                        
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(current) + 1;
                            if (index > 0) {
                                selector += `:nth-child(${index})`;
                            }
                        }
                    }
                } catch (siblingError) {
                    console.warn('Error processing siblings:', siblingError);
                }
                
                path.unshift(selector);
                current = current.parentElement;
            }
            
            return path.length > 0 ? path.join(' > ') : element.tagName?.toLowerCase() || 'unknown';
        } catch (error) {
            console.warn('Error in generateCSSSelector:', error);
            return element.tagName?.toLowerCase() || 'unknown';
        }
    }

    function generateXPathSelector(element) {
        if (element.id) {
            const xpathById = `//*[@id="${element.id}"]`;
            if (isLocatorUnique(xpathById, element)) {
                return xpathById;
            }
        }
        
        const path = [];
        let current = element;
        
        while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            
            if (current.id) {
                selector = `${selector}[@id="${current.id}"]`;
                path.unshift(selector);
                break;
            }
            
            const siblings = Array.from(current.parentNode?.children || []).filter(
                sibling => sibling.tagName === current.tagName
            );
            
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `[${index}]`;
            }
            
            path.unshift(selector);
            current = current.parentElement;
        }
        
        return '//' + path.join('/');
    }

    function generateLocators(element) {
        const locators = [];
        const uniqueLocators = [];
        const nonUniqueLocators = [];
        
        // Priority 1: getByTestId (highest priority)
        const testId = element.getAttribute('data-testid');
        if (testId) {
            const locator = `page.getByTestId("${testId}")`;
            if (isLocatorUnique(locator, element)) {
                uniqueLocators.push(locator);
            } else {
                nonUniqueLocators.push(locator);
            }
        }
        
        // Priority 2: getByRole with name
        const role = getElementRole(element);
        if (role) {
            const accessibleName = element.textContent?.trim();
            if (accessibleName && accessibleName.length < 50 && accessibleName.length > 0) {
                const locator = `page.getByRole("${role}", { name: "${accessibleName}" })`;
                if (isLocatorUnique(locator, element)) {
                    uniqueLocators.push(locator);
                } else {
                    nonUniqueLocators.push(locator);
                }
            } else {
                const locator = `page.getByRole("${role}")`;
                if (isLocatorUnique(locator, element)) {
                    uniqueLocators.push(locator);
                } else {
                    nonUniqueLocators.push(locator);
                }
            }
        }
        
        // Priority 3: getByLabel
        const id = element.getAttribute('id');
        if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) {
                const labelText = label.textContent?.trim();
                if (labelText) {
                    const locator = `page.getByLabel("${labelText}")`;
                    if (isLocatorUnique(locator, element)) {
                        uniqueLocators.push(locator);
                    } else {
                        nonUniqueLocators.push(locator);
                    }
                }
            }
        }
        
        // Priority 4: getByPlaceholder
        const placeholder = element.getAttribute('placeholder');
        if (placeholder) {
            const locator = `page.getByPlaceholder("${placeholder}")`;
            if (isLocatorUnique(locator, element)) {
                uniqueLocators.push(locator);
            } else {
                nonUniqueLocators.push(locator);
            }
        }
        
        // Priority 5: getByAltText
        const alt = element.getAttribute('alt');
        if (alt) {
            const locator = `page.getByAltText("${alt}")`;
            if (isLocatorUnique(locator, element)) {
                uniqueLocators.push(locator);
            } else {
                nonUniqueLocators.push(locator);
            }
        }
        
        // Priority 6: getByTitle
        const title = element.getAttribute('title');
        if (title) {
            const locator = `page.getByTitle("${title}")`;
            if (isLocatorUnique(locator, element)) {
                uniqueLocators.push(locator);
            } else {
                nonUniqueLocators.push(locator);
            }
        }
        
        // Priority 7: getByText (lower priority as it can be fragile)
        const text = element.textContent?.trim();
        if (text && text.length < 50 && text.length > 0) {
            const locator = `page.getByText("${text}")`;
            if (isLocatorUnique(locator, element)) {
                uniqueLocators.push(locator);
            } else {
                nonUniqueLocators.push(locator);
            }
        }
        
        // Combine unique first, then non-unique Playwright locators
        locators.push(...uniqueLocators);
        locators.push(...nonUniqueLocators);
        
        // Add separator comment
        if (locators.length > 0) {
            locators.push('// --- CSS & XPath Locators ---');
        }
        
        // Priority 8: CSS Selector
        try {
            const cssSelector = generateCSSSelector(element);
            if (cssSelector) {
                locators.push(`CSS: ${cssSelector}`);
            }
        } catch (error) {
            console.warn('Failed to generate CSS selector:', error);
            // Fallback: simple tag selector
            try {
                locators.push(`CSS: ${element.tagName.toLowerCase()}`);
            } catch (fallbackError) {
                console.warn('Failed to generate fallback CSS selector:', fallbackError);
            }
        }
        
        // Priority 9: XPath Selector
        try {
            const xpathSelector = generateXPathSelector(element);
            if (xpathSelector) {
                locators.push(`XPath: ${xpathSelector}`);
            }
        } catch (error) {
            console.warn('Failed to generate XPath selector:', error);
            // Fallback: simple tag xpath
            try {
                locators.push(`XPath: //${element.tagName.toLowerCase()}`);
            } catch (fallbackError) {
                console.warn('Failed to generate fallback XPath selector:', fallbackError);
            }
        }
        
        return locators;
    }
    
    function testLocator(locatorString) {
        matchedElements.forEach(el => el.classList.remove('plf-match'));
        matchedElements = [];
        
        if (!locatorString.trim()) {
            updateResults('Enter a locator to test');
            return;
        }
        
        // Skip comment lines
        if (locatorString.startsWith('//')) {
            updateResults('Comment line - select a locator to test');
            return;
        }
        
        try {
            let elements = [];
            
            if (locatorString.includes('getByTestId')) {
                const match = locatorString.match(/getByTestId\(['"]([^'"]+)['"]\)/);
                if (match) {
                    elements = Array.from(document.querySelectorAll(`[data-testid="${match[1]}"]`));
                }
            } else if (locatorString.includes('getByRole')) {
                const match = locatorString.match(/getByRole\(['"]([^'"]+)['"](?:,\s*{\s*name:\s*['"]([^'"]+)['"]\s*})?\)/);
                if (match) {
                    const [, role, name] = match;
                    elements = Array.from(document.querySelectorAll('*')).filter(el => {
                        const elRole = getElementRole(el);
                        if (elRole !== role) return false;
                        if (name) {
                            return el.textContent?.trim() === name;
                        }
                        return true;
                    });
                }
            } else if (locatorString.includes('getByText')) {
                const match = locatorString.match(/getByText\(['"]([^'"]+)['"]\)/);
                if (match) {
                    const text = match[1];
                    elements = Array.from(document.querySelectorAll('*')).filter(el => 
                        el.textContent?.trim() === text
                    );
                }
            } else if (locatorString.includes('getByLabel')) {
                const match = locatorString.match(/getByLabel\(['"]([^'"]+)['"]\)/);
                if (match) {
                    const labelText = match[1];
                    const labels = Array.from(document.querySelectorAll('label')).filter(label =>
                        label.textContent?.trim() === labelText
                    );
                    elements = labels.map(label => {
                        const forId = label.getAttribute('for');
                        return forId ? document.getElementById(forId) : label.querySelector('input, select, textarea');
                    }).filter(Boolean);
                }
            } else if (locatorString.includes('getByPlaceholder')) {
                const match = locatorString.match(/getByPlaceholder\(['"]([^'"]+)['"]\)/);
                if (match) {
                    elements = Array.from(document.querySelectorAll(`[placeholder="${match[1]}"]`));
                }
            } else if (locatorString.includes('getByAltText')) {
                const match = locatorString.match(/getByAltText\(['"]([^'"]+)['"]\)/);
                if (match) {
                    elements = Array.from(document.querySelectorAll(`[alt="${match[1]}"]`));
                }
            } else if (locatorString.includes('getByTitle')) {
                const match = locatorString.match(/getByTitle\(['"]([^'"]+)['"]\)/);
                if (match) {
                    elements = Array.from(document.querySelectorAll(`[title="${match[1]}"]`));
                }
            } else if (locatorString.startsWith('CSS:')) {
                // Handle CSS selector
                const cssSelector = locatorString.replace('CSS:', '').trim();
                elements = Array.from(document.querySelectorAll(cssSelector));
            } else if (locatorString.startsWith('XPath:')) {
                // Handle XPath selector
                const xpathSelector = locatorString.replace('XPath:', '').trim();
                const result = document.evaluate(
                    xpathSelector,
                    document,
                    null,
                    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                    null
                );
                elements = [];
                for (let i = 0; i < result.snapshotLength; i++) {
                    elements.push(result.snapshotItem(i));
                }
            } else {
                // Try as CSS selector (fallback)
                elements = Array.from(document.querySelectorAll(locatorString));
            }
            
            elements.forEach(el => el.classList.add('plf-match'));
            matchedElements = elements;
            
            const uniqueText = elements.length === 1 ? ' (✓ Unique)' : elements.length > 1 ? ' (⚠ Multiple)' : '';
            updateResults(`Found ${elements.length} matching element(s)${uniqueText}`);
            
        } catch (error) {
            updateResults(`Error: ${error.message}`);
        }
    }
    
    function updateResults(message) {
        if (evaluatorWindow) {
            const results = evaluatorWindow.querySelector('.plf-results');
            if (results) {
                results.textContent = message;
            }
        }
    }
    
    function makeDraggable(element, handle) {
        let isDragging = false;
        let mouseStartX = 0;
        let mouseStartY = 0;
        let elementStartX = 0;
        let elementStartY = 0;
        
        function dragStart(e) {
            // Only start dragging if clicking on the header (not the close button)
            if (e.target.classList.contains('plf-close')) {
                return;
            }
            
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            
            // Record mouse starting position
            mouseStartX = e.clientX;
            mouseStartY = e.clientY;
            
            // Get element's current position (computed style)
            const computedStyle = window.getComputedStyle(element);
            elementStartX = parseInt(computedStyle.left) || 0;
            elementStartY = parseInt(computedStyle.top) || 0;
            
            // Override any existing positioning
            element.style.position = 'fixed';
            element.style.left = elementStartX + 'px';
            element.style.top = elementStartY + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';
            element.style.margin = '0';
            
            // Visual feedback
            element.style.cursor = 'grabbing';
            handle.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
            
            console.log('Drag start:', { mouseStartX, mouseStartY, elementStartX, elementStartY });
        }
        
        function drag(e) {
            if (!isDragging) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            // Calculate how far the mouse has moved
            const mouseDeltaX = e.clientX - mouseStartX;
            const mouseDeltaY = e.clientY - mouseStartY;
            
            // Calculate new element position
            let newX = elementStartX + mouseDeltaX;
            let newY = elementStartY + mouseDeltaY;
            
            // Get viewport dimensions
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            
            // Get element dimensions
            const elementWidth = element.offsetWidth;
            const elementHeight = element.offsetHeight;
            
            // Constrain to viewport bounds
            newX = Math.max(0, Math.min(newX, viewportWidth - elementWidth));
            newY = Math.max(0, Math.min(newY, viewportHeight - elementHeight));
            
            // Apply new position with !important to override any conflicting styles
            element.style.setProperty('left', newX + 'px', 'important');
            element.style.setProperty('top', newY + 'px', 'important');
            element.style.setProperty('right', 'auto', 'important');
            element.style.setProperty('bottom', 'auto', 'important');
            
            console.log('Dragging:', { 
                mouseX: e.clientX, 
                mouseY: e.clientY, 
                mouseDeltaX, 
                mouseDeltaY, 
                newX, 
                newY 
            });
        }
        
        function dragEnd(e) {
            if (!isDragging) return;
            
            isDragging = false;
            
            // Reset cursors
            element.style.cursor = 'default';
            handle.style.cursor = 'move';
            document.body.style.userSelect = '';
            
            console.log('Drag end');
        }
        
        // Add event listeners
        handle.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        
        // Prevent default drag behavior on images/text
        handle.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Initial setup - ensure proper positioning
        element.style.position = 'fixed';
        element.style.zIndex = '2147483647';
        
        console.log('Draggable initialized for element:', element);
    }
    
    function createEvaluator() {
        if (evaluatorWindow) return;
        
        evaluatorWindow = document.createElement('div');
        evaluatorWindow.className = 'plf-evaluator';
        evaluatorWindow.innerHTML = `
            <div class="plf-header" id="plf-drag-header">
                <span>Playwright Locator Finder <span class="plf-drag-handle">⋮⋮</span></span>
                <button class="plf-close" title="Close">&times;</button>
            </div>
            <div class="plf-content">
                <textarea class="plf-textarea" placeholder="Click an element or enter a Playwright locator to test..."></textarea>
                <div class="plf-buttons">
                    <button class="plf-button plf-button-primary" data-action="test">Test</button>
                    <button class="plf-button plf-button-secondary" data-action="copy">Copy</button>
                    <button class="plf-button plf-button-secondary" data-action="clear">Clear</button>
                </div>
                <div class="plf-results">Click an element to generate locators</div>
            </div>
        `;
        
        document.body.appendChild(evaluatorWindow);
        
        const textarea = evaluatorWindow.querySelector('.plf-textarea');
        const closeBtn = evaluatorWindow.querySelector('.plf-close');
        const header = evaluatorWindow.querySelector('#plf-drag-header');
        
        // Make the window draggable
        makeDraggable(evaluatorWindow, header);
        
        // Event listeners
        closeBtn.addEventListener('click', stopInspection);
        
        evaluatorWindow.addEventListener('click', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action === 'test') {
                testLocator(textarea.value);
            } else if (action === 'copy') {
                navigator.clipboard.writeText(textarea.value).then(() => {
                    updateResults('Copied to clipboard!');
                    setTimeout(() => updateResults('Ready'), 2000);
                });
            } else if (action === 'clear') {
                textarea.value = '';
                clearHighlights();
                updateResults('Cleared');
            }
        });
        
        textarea.addEventListener('input', () => {
            testLocator(textarea.value);
        });
        
        // Prevent clicks on evaluator from propagating
        evaluatorWindow.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    function startInspection() {
        if (isActive) return;
        
        isActive = true;
        createEvaluator();
        
        document.addEventListener('mouseover', handleMouseOver, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleKeyDown, true);
        
        // Add visual indicator
        document.body.style.cursor = 'crosshair';
    }
    
    function stopInspection() {
        isActive = false;
        
        document.removeEventListener('mouseover', handleMouseOver, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeyDown, true);
        
        clearHighlights();
        
        if (evaluatorWindow) {
            evaluatorWindow.remove();
            evaluatorWindow = null;
        }
        
        document.body.style.cursor = '';
        
        // Clean up
        window.__PLAYWRIGHT_LOCATOR_FINDER = false;
    }
    
    function handleMouseOver(e) {
        if (!isActive) return;
        if (e.target.closest('.plf-evaluator')) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        highlightElement(e.target);
    }
    
    function handleClick(e) {
        if (!isActive) return;
        if (e.target.closest('.plf-evaluator')) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const locators = generateLocators(e.target);
        
        if (evaluatorWindow && locators.length > 0) {
            const textarea = evaluatorWindow.querySelector('.plf-textarea');
            textarea.value = locators.join('\n');
            testLocator(locators[0]);
        }
    }
    
    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            stopInspection();
        }
    }
    
    // Start inspection immediately
    startInspection();
    
    console.log('Playwright Locator Finder activated. Press ESC to exit.');
})();