---
icon: lucide-replace-all
cssclasses:
  - metadata-no-actions
---
```dataviewjs
const { vault } = app;
dv.container.empty();

const wrapper = dv.container.createEl("div", {
    attr: {
        style: `
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
            font-family: var(--font-interface);
            max-width: 750px;
            margin: 15px auto;
        `
    }
});

const headerBox = wrapper.createEl("div", {
    attr: { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 12px;" }
});

headerBox.createEl("h3", {
    text: "Global Replacement",
    attr: { style: "margin: 0; color: var(--text-normal); font-size: 1.15em; font-weight: 600;" }
});

const settingsToggleBtn = headerBox.createEl("button", {
    text: "⚙️ Settings",
    attr: {
        style: `
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            color: var(--text-muted);
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.85em;
            cursor: pointer;
            transition: all 0.2s;
        `
    }
});

const settingsDropdown = wrapper.createEl("div", {
    attr: {
        style: `
            display: none;
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 16px;
            gap: 16px;
            flex-direction: column;
        `
    }
});

settingsToggleBtn.addEventListener("click", () => {
    const isVisible = settingsDropdown.style.display === "flex";
    settingsDropdown.style.display = isVisible ? "none" : "flex";
    settingsToggleBtn.style.background = isVisible ? "var(--background-secondary)" : "var(--interactive-accent)";
    settingsToggleBtn.style.color = isVisible ? "var(--text-muted)" : "var(--text-on-accent)";
});

const createSettingsCheckbox = (labelText, descText) => {
    const label = settingsDropdown.createEl("label", {
        attr: { style: "display: flex; align-items: flex-start; gap: 10px; cursor: pointer;" }
    });
    const checkbox = label.createEl("input", {
        type: "checkbox",
        attr: { style: "margin-top: 3px; cursor: pointer;" }
    });
    const textDiv = label.createEl("div");
    textDiv.createEl("div", { text: labelText, attr: { style: "font-weight: 600; font-size: 0.9em; color: var(--text-normal);" } });
    textDiv.createEl("div", { text: descText, attr: { style: "font-size: 0.8em; color: var(--text-muted);" } });
    return checkbox;
};

const caseSensitiveCheckbox = createSettingsCheckbox("Case Sensitive", "Match uppercase and lowercase letters precisely (A ≠ a).");
const regexCheckbox = createSettingsCheckbox("Advanced Regular Expression (Regex)", "Use programming search symbols like ranges and advanced patterns.");

const createInputField = (labelText, placeholderText) => {
    const group = wrapper.createEl("div", { attr: { style: "margin-bottom: 12px;" } });
    group.createEl("label", {
        text: labelText,
        attr: { style: "display: block; font-size: 0.85em; font-weight: 600; margin-bottom: 5px; color: var(--text-muted);" }
    });
    return group.createEl("textarea", {
        attr: {
            placeholder: placeholderText,
            rows: "2",
            style: `
                width: 100%;
                padding: 10px 12px;
                border-radius: 6px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-secondary);
                color: var(--text-normal);
                resize: vertical;
                font-size: 0.95em;
                outline: none;
                transition: border-color 0.2s, background 0.2s;
            `
        }
    });
};

const searchInput = createInputField("Search for:", "Type the word or phrase here...");
const replaceInput = createInputField("Replace with:", "Type the replacement text here...");

[searchInput, replaceInput].forEach(el => {
    el.addEventListener("focus", () => el.style.borderColor = "var(--interactive-accent)");
    el.addEventListener("blur", () => el.style.borderColor = "var(--background-modifier-border)");
});

const actionsBar = wrapper.createEl("div", {
    attr: { style: "display: flex; gap: 10px; margin-top: 15px;" }
});

const searchBtn = actionsBar.createEl("button", {
    text: "Search Vault",
    cls: "mod-cta",
    attr: { style: "padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; flex: 1; border: none; transition: background 0.2s;" }
});

const replaceAllBtn = actionsBar.createEl("button", {
    text: "Replace All",
    attr: {
        style: `
            padding: 8px 18px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            background: var(--color-red);
            color: white;
            border: none;
            display: none;
        `
    }
});

const resultsBox = wrapper.createEl("div", { attr: { style: "margin-top: 15px;" } });
let currentMatches = [];

function getSearchRegex(query) {
    if (!query) return null;
    try {
        let flags = "g";
        if (!caseSensitiveCheckbox.checked) flags += "i";
        
        if (regexCheckbox.checked) {
            return new RegExp(query, flags);
        } else {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escaped, flags);
        }
    } catch (e) {
        return null;
    }
}

searchBtn.addEventListener("click", async () => {
    const rawQuery = searchInput.value;
    resultsBox.empty();
    replaceAllBtn.style.display = "none";
    currentMatches = [];

    if (!rawQuery) {
        new Notice("Please enter text to search for.");
        return;
    }

    const regex = getSearchRegex(rawQuery);
    if (!regex) {
        new Notice("Invalid Regular Expression (Regex) format!");
        return;
    }


    searchBtn.textContent = "⏳ Searching...";
    searchBtn.style.background = "var(--interactive-accent-hover)";
    searchBtn.disabled = true;

    const files = vault.getMarkdownFiles();
    for (const file of files) {
        const content = await vault.read(file);
        regex.lastIndex = 0;
        const matches = content.match(regex);
        if (matches) {
            const lines = content.split("\n");
            const matchedSnippets = [];
            for (const line of lines) {
                if (regex.test(line)) {
                    matchedSnippets.push(line.trim());
                    if (matchedSnippets.length >= 2) break;
                }
                regex.lastIndex = 0;
            }
            currentMatches.push({ file, count: matches.length, snippets: matchedSnippets });
        }
    }


    searchBtn.textContent = "✓ Search Complete";
    searchBtn.style.background = "var(--color-green)";
    setTimeout(() => {
        searchBtn.textContent = "Search Vault";
        searchBtn.style.background = "var(--interactive-accent)";
        searchBtn.disabled = false;
    }, 1200);

    if (currentMatches.length === 0) {
        resultsBox.createEl("div", {
            text: "No matching results found.",
            attr: { style: "text-align: center; padding: 15px; color: var(--text-muted); font-size: 0.9em;" }
        });
        return;
    }

    replaceAllBtn.style.display = "block";
    replaceAllBtn.textContent = `Replace All (${currentMatches.length} files)`;

    resultsBox.createEl("div", {
        text: `Found Results (${currentMatches.length} files):`,
        attr: { style: "font-size: 0.85em; color: var(--text-muted); margin-bottom: 8px; font-weight: 600;" }
    });

    const list = resultsBox.createEl("div", {
        attr: { style: "display: flex; flex-direction: column; gap: 8px; max-height: 380px; overflow-y: auto;" }
    });

    currentMatches.forEach(({ file, count, snippets }) => {
        const card = list.createEl("div", {
            attr: {
                style: `
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    padding: 10px 12px;
                    background: var(--background-secondary);
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 6px;
                `
            }
        });

        const topRow = card.createEl("div", { attr: { style: "display: flex; justify-content: space-between; align-items: center;" } });
        const infoDiv = topRow.createEl("div", { attr: { style: "display: flex; align-items: center; gap: 8px; overflow: hidden;" } });
        
        const link = infoDiv.createEl("a", {
            text: file.basename,
            attr: {
                title: file.path,
                style: "font-weight: 600; font-size: 0.9em; color: var(--text-accent); text-decoration: none; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
            }
        });
        link.onclick = (e) => {
            e.preventDefault();
            app.workspace.openLinkText(file.path, "", false);
        };

        infoDiv.createEl("span", {
            text: `${count} matches`,
            attr: { style: "font-size: 0.75em; background: var(--background-primary); padding: 2px 6px; border-radius: 4px; color: var(--text-muted); border: 1px solid var(--background-modifier-border);" }
        });


        const controlsDiv = topRow.createEl("div", { attr: { style: "display: flex; gap: 6px; align-items: center;" } });


        const infoToggleBtn = controlsDiv.createEl("button", {
            text: "i",
            attr: {
                title: "View Full Context",
                style: `
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    border: 1px solid var(--background-modifier-border);
                    background: var(--background-primary);
                    color: var(--text-muted);
                    font-size: 0.8em;
                    font-weight: bold;
                    font-style: italic;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `
            }
        });

        const singleBtn = controlsDiv.createEl("button", {
            text: "Replace",
            cls: "single-replace-btn",
            attr: {
                style: `
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-size: 0.8em;
                    cursor: pointer;
                    background: var(--interactive-accent);
                    color: var(--text-on-accent);
                    border: none;
                    flex-shrink: 0;
                `
            }
        });

        singleBtn.addEventListener("click", async () => {
            const regexCall = getSearchRegex(searchInput.value);
            const replacement = replaceInput.value;
            const content = await vault.read(file);
            await vault.modify(file, content.replace(regexCall, replacement));

            singleBtn.textContent = "✓ Done";
            singleBtn.disabled = true;
            singleBtn.style.background = "var(--color-green)";
            new Notice(`Replaced in: ${file.basename}`);
        });


        if (snippets && snippets.length > 0) {
            const snippetBox = card.createEl("div", {
                attr: {
                    style: `
                        display: none;
                        font-size: 0.8em;
                        color: var(--text-muted);
                        background: var(--background-primary);
                        padding: 6px 8px;
                        border-radius: 4px;
                        border-right: 3px solid var(--interactive-accent);
                        white-space: pre-wrap;
                        word-break: break-all;
                        margin-top: 4px;
                    `
                }
            });
            snippetBox.textContent = snippets.join(" \n ");

            infoToggleBtn.addEventListener("click", () => {
                const isHidden = snippetBox.style.display === "none";
                snippetBox.style.display = isHidden ? "block" : "none";
                infoToggleBtn.style.background = isHidden ? "var(--interactive-accent)" : "var(--background-primary)";
                infoToggleBtn.style.color = isHidden ? "var(--text-on-accent)" : "var(--text-muted)";
            });
        } else {
            infoToggleBtn.style.display = "none";
        }
    });
});

replaceAllBtn.addEventListener("click", async () => {
    const rawQuery = searchInput.value;
    const replacement = replaceInput.value;
    const regex = getSearchRegex(rawQuery);

    if (!rawQuery || !regex || currentMatches.length === 0) return;

    replaceAllBtn.textContent = "⏳ Replacing...";
    replaceAllBtn.disabled = true;

    let updatedCount = 0;
    for (const { file } of currentMatches) {
        const content = await vault.read(file);
        regex.lastIndex = 0;
        if (regex.test(content)) {
            regex.lastIndex = 0;
            const newContent = content.replace(regex, replacement);
            await vault.modify(file, newContent);
            updatedCount++;
        }
    }

    resultsBox.querySelectorAll(".single-replace-btn").forEach(btn => {
        btn.textContent = "✓ Done";
        btn.disabled = true;
        btn.style.background = "var(--color-green)";
    });

    replaceAllBtn.textContent = "✓ Global Replacement Complete";
    replaceAllBtn.style.background = "var(--color-green)";
    new Notice(`Global replacement completed in ${updatedCount} files.`);
});
```