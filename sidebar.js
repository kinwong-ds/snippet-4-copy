// sidebar.js

const snippetInput = document.getElementById('snippet-input');
const groupInput = document.getElementById('group-input'); // New group input
const addSnippetBtn = document.getElementById('add-snippet-btn');
const snippetsList = document.getElementById('snippets-list');

const UNGROUPED_KEY = '__ungrouped__'; // Key for snippets without a group

// --- Storage Functions ---

// Function to get snippet groups from storage
async function getSnippetGroups() {
    // Structure: { "groupName": ["snippet1", "snippet2"], "__ungrouped__": ["snippet3"] }
    const result = await chrome.storage.local.get(['snippetGroups']);
    return result.snippetGroups || {}; // Return groups object or empty object
}

// Function to get group order from storage
async function getGroupOrder() {
    const result = await chrome.storage.local.get(['groupOrder']);
    // Ensure Ungrouped is always present, typically at the end if not explicitly ordered
    const order = result.groupOrder || [];
    if (!order.includes(UNGROUPED_KEY)) {
        order.push(UNGROUPED_KEY); // Add if missing
    }
    return order;
}

// Function to save snippet groups to storage
async function saveSnippetGroups(groups) {
    await chrome.storage.local.set({ snippetGroups: groups });
}

// Function to save group order to storage
async function saveGroupOrder(order) {
    // Filter out any potential duplicates just in case
    const uniqueOrder = [...new Set(order)];
    await chrome.storage.local.set({ groupOrder: uniqueOrder });
}

// --- Display Functions ---

// Function to display snippets, organized by group
async function displaySnippets() {
    const groups = await getSnippetGroups();
    const groupOrder = await getGroupOrder();
    snippetsList.innerHTML = ''; // Clear the current list

    // Get all actual group names present in the data
    const actualGroupNames = Object.keys(groups);

    // Create a sorted list based on groupOrder, adding any missing groups alphabetically at the end (before Ungrouped)
    const sortedGroupNames = [];
    const groupsNotInOrder = [];

    // Add groups based on the stored order
    groupOrder.forEach(name => {
        if (actualGroupNames.includes(name)) {
            sortedGroupNames.push(name);
        }
    });

    // Find groups present in data but not in the stored order
    actualGroupNames.forEach(name => {
        if (!groupOrder.includes(name)) {
            groupsNotInOrder.push(name);
        }
    });

    // Sort the missing groups alphabetically (excluding Ungrouped if it was handled)
    groupsNotInOrder.sort((a, b) => {
         if (a === UNGROUPED_KEY) return 1; // Should ideally be handled by groupOrder, but as fallback
         if (b === UNGROUPED_KEY) return -1;
         return a.localeCompare(b);
    });

    // Insert the alphabetically sorted missing groups before the Ungrouped section if it exists in sortedGroupNames
    const ungroupedIndex = sortedGroupNames.indexOf(UNGROUPED_KEY);
    if (ungroupedIndex !== -1) {
        sortedGroupNames.splice(ungroupedIndex, 0, ...groupsNotInOrder);
    } else {
        // If Ungrouped wasn't in the order for some reason, append the rest
        sortedGroupNames.push(...groupsNotInOrder);
    }

    // Ensure Ungrouped is present if it has snippets, even if missing from order somehow
    if (groups[UNGROUPED_KEY] && groups[UNGROUPED_KEY].length > 0 && !sortedGroupNames.includes(UNGROUPED_KEY)) {
       sortedGroupNames.push(UNGROUPED_KEY);
    }

    // Final cleanup: remove duplicates if any crept in
    const finalGroupNames = [...new Set(sortedGroupNames)];


    if (finalGroupNames.length === 0) {

        snippetsList.textContent = 'No snippets saved yet.';
        return;
    }

    finalGroupNames.forEach(groupName => {
        const snippets = groups[groupName];
        // Skip groups that might be in the order but have no snippets (e.g., after deletion)
        if (!snippets || snippets.length === 0) {
            return;
        }

        const groupContainer = document.createElement('div');
        groupContainer.classList.add('snippet-group');

        const groupHeader = document.createElement('h3');
        const groupTitle = document.createElement('span');
        groupTitle.textContent = groupName === UNGROUPED_KEY ? 'Ungrouped' : groupName;
        groupHeader.appendChild(groupTitle);

        // Add sorting buttons container
        const sortButtonsContainer = document.createElement('div');
        sortButtonsContainer.classList.add('sort-buttons');
        // Add delete button for the group (except for ungrouped)
        // Add Up/Down buttons only for actual groups
        if (groupName !== UNGROUPED_KEY) {
            const moveUpBtn = document.createElement('button');
            moveUpBtn.classList.add('sort-btn', 'move-up-btn');
            moveUpBtn.innerHTML = '&uarr;'; // Up arrow
            moveUpBtn.title = 'Move group up';
            moveUpBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                moveGroupUp(groupName);
            });
            sortButtonsContainer.appendChild(moveUpBtn);

            const moveDownBtn = document.createElement('button');
            moveDownBtn.classList.add('sort-btn', 'move-down-btn');
            moveDownBtn.innerHTML = '&darr;'; // Down arrow
            moveDownBtn.title = 'Move group down';
            moveDownBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                moveGroupDown(groupName);
            });
            sortButtonsContainer.appendChild(moveDownBtn);

            // Add delete button for the group
            const deleteGroupBtn = document.createElement('button');
            deleteGroupBtn.classList.add('delete-group-btn');
            deleteGroupBtn.textContent = 'Delete Group';
            deleteGroupBtn.title = `Delete group "${groupName}"`;
            deleteGroupBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteGroup(groupName);
            });
            sortButtonsContainer.appendChild(deleteGroupBtn); // Add delete button here too
        }

        groupHeader.appendChild(sortButtonsContainer); // Add the button container to the header

        groupContainer.appendChild(groupHeader);

        const groupContent = document.createElement('div');
        groupContent.classList.add('snippet-group-content');

        snippets.forEach((snippetText, index) => {
            const snippetDiv = document.createElement('div');
            snippetDiv.classList.add('snippet-item');
            snippetDiv.textContent = snippetText;

            // Add click listener for copying
            snippetDiv.addEventListener('click', (event) => {
                if (event.target.classList.contains('delete-btn')) return;
                copySnippet(snippetText, snippetDiv);
            });

            // Add delete button for individual snippet
            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('delete-btn');
            deleteBtn.textContent = 'X';
            deleteBtn.title = 'Delete snippet';
            deleteBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteSnippet(groupName, index);
            });

            snippetDiv.appendChild(deleteBtn);
            groupContent.appendChild(snippetDiv);
        });

        groupContainer.appendChild(groupContent);
        snippetsList.appendChild(groupContainer);
    });
}

// --- Action Functions ---

// Function to add a new snippet (now considers group)
async function addSnippet() {
    const text = snippetInput.value.trim();
    const groupName = groupInput.value.trim() || UNGROUPED_KEY; // Use special key if no group entered

    if (text) {
        const groups = await getSnippetGroups();

        let isNewGroup = false;
        // Ensure the group array exists
        if (!groups[groupName]) {
            groups[groupName] = [];
            isNewGroup = groupName !== UNGROUPED_KEY; // Mark if it's a new, non-ungrouped group
        }

        groups[groupName].push(text); // Add the new snippet to the correct group
        await saveSnippetGroups(groups);

        // If it was a new group, add it to the order (e.g., before Ungrouped)
        if (isNewGroup) {
            const groupOrder = await getGroupOrder();
            if (!groupOrder.includes(groupName)) {
                const ungroupedIndex = groupOrder.indexOf(UNGROUPED_KEY);
                if (ungroupedIndex !== -1) {
                    groupOrder.splice(ungroupedIndex, 0, groupName); // Insert before Ungrouped
                } else {
                    groupOrder.push(groupName); // Append if Ungrouped isn't found (shouldn't happen often)
                }
                await saveGroupOrder(groupOrder);
            }
        }

        snippetInput.value = ''; // Clear the snippet input
        groupInput.value = ''; // Clear the group input
        await displaySnippets(); // Refresh the displayed list
    } else {
        console.log("Snippet input is empty.");
    }
}

// Function to copy snippet text to clipboard (no change needed here)
function copySnippet(text, element) {
    navigator.clipboard.writeText(text).then(() => {
        console.log('Snippet copied to clipboard!');
        element.classList.add('copied');
        setTimeout(() => {
            element.classList.remove('copied');
        }, 500);
    }).catch(err => {
        console.error('Failed to copy snippet: ', err);
    });
}

// Function to delete an individual snippet from a specific group
async function deleteSnippet(groupName, indexToDelete) {
    let groups = await getSnippetGroups();
    if (groups[groupName]) {
        // Remove the snippet at the specified index from the group's array
        groups[groupName] = groups[groupName].filter((_, index) => index !== indexToDelete);

        // Optional: Remove the group if it becomes empty (except ungrouped)
        if (groupName !== UNGROUPED_KEY && groups[groupName].length === 0) {
            delete groups[groupName];
        }

        await saveSnippetGroups(groups);
        await displaySnippets(); // Refresh the list
    } else {
        console.error(`Group "${groupName}" not found for deletion.`);
    }
}

// Function to delete an entire group
async function deleteGroup(groupName) {
    // Prevent deleting the special ungrouped key directly
    if (groupName === UNGROUPED_KEY) {
        console.warn("Cannot delete the 'Ungrouped' section directly. Delete individual snippets instead.");
        return;
    }

    let groups = await getSnippetGroups();
    if (groups[groupName]) {
        // Optional: Confirm before deleting a group?
        // if (!confirm(`Are you sure you want to delete the group "${groupName}" and all its snippets?`)) {
        //     return;
        // }
        delete groups[groupName]; // Remove the entire group entry
        await saveSnippetGroups(groups);

        // Also remove the group from the order
        const groupOrder = await getGroupOrder();
        const updatedOrder = groupOrder.filter(name => name !== groupName);
        await saveGroupOrder(updatedOrder);

        await displaySnippets(); // Refresh the list
    } else {
        console.error(`Group "${groupName}" not found for deletion.`);
    }
}
// --- Reordering Functions ---

async function moveGroupUp(groupName) {
    const groupOrder = await getGroupOrder();
    const index = groupOrder.indexOf(groupName);

    // Can move up if it's not the first element and not the Ungrouped key
    if (index > 0 && groupName !== UNGROUPED_KEY) {
        // Swap with the previous element
        [groupOrder[index], groupOrder[index - 1]] = [groupOrder[index - 1], groupOrder[index]];
        await saveGroupOrder(groupOrder);
        await displaySnippets(); // Refresh display
    } else {
        console.log(`Cannot move group "${groupName}" further up.`);
    }
}

async function moveGroupDown(groupName) {
    const groupOrder = await getGroupOrder();
    const index = groupOrder.indexOf(groupName);
    const ungroupedIndex = groupOrder.indexOf(UNGROUPED_KEY);

    // Can move down if it's not the last element AND it's not the element right before Ungrouped (if Ungrouped is last)
    let canMoveDown = index !== -1 && index < groupOrder.length - 1 && groupName !== UNGROUPED_KEY;

    // Prevent moving a group *past* the Ungrouped section if Ungrouped is the last item
    if (ungroupedIndex === groupOrder.length - 1 && index === ungroupedIndex - 1) {
        canMoveDown = false;
    }


    if (canMoveDown) {
        // Swap with the next element
        [groupOrder[index], groupOrder[index + 1]] = [groupOrder[index + 1], groupOrder[index]];
        await saveGroupOrder(groupOrder);
        await displaySnippets(); // Refresh display
    } else {
         console.log(`Cannot move group "${groupName}" further down.`);
    }
}


// --- Event Listeners ---

// Add listener for the "Add Snippet" button
addSnippetBtn.addEventListener('click', addSnippet);

// Add listener for pressing Enter in the snippet textarea
snippetInput.addEventListener('keypress', (event) => {
    // Add snippet if Enter is pressed without Shift key
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent default newline insertion
        addSnippet();
    }
});

// Add listener for pressing Enter in the group input field
groupInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        addSnippet(); // Add snippet when Enter is pressed in group input too
    }
});


// --- Initial Load ---

// Load and display snippets when the sidebar opens
displaySnippets();