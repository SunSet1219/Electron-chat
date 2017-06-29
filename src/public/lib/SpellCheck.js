const os = require('os');
const checker = require('spellchecker');
const { remote, webFrame } = require('electron');

const webContents = remote.getCurrentWebContents();
let menu = new remote.Menu();

const path = remote.require('path');
const isWindows = ['win32', 'win64'].indexOf(os.platform()) !== -1;

class SpellCheck {

    get userLanguage () {
        const lang = localStorage.getItem('userLanguage');
        if (lang) {
            return lang.replace('-', '_');
        }
    }

    get dictionaries () {
        const dictionaries = localStorage.getItem('spellcheckerDictionaries');
        if (dictionaries) {
            const result = JSON.parse(dictionaries);
            if (Array.isArray(result)) {
                return result;
            }
        }
    }

    constructor () {
        this.enabledDictionaries = [];
        this.contractions = this.getContractions();
        this.loadAvailableDictionaries();
        this.setEnabledDictionaries();

        this.languagesMenu = {
            label: 'Spelling languages',
            submenu: this.availableDictionaries.map((dictionary) => {
                const menu = {
                    label: dictionary,
                    type: 'checkbox',
                    checked: this.enabledDictionaries.indexOf(dictionary) !== -1,
                    click: (menuItem) => {
                        menu.checked = menuItem.checked;
                        // If not using os dictionary then limit to only 1 language
                        if (!this.multiLanguage) {
                            this.languagesMenu.submenu.forEach((m) => {
                                if (m.label !== menuItem.label) {
                                    m.checked = false;
                                }
                            });
                        }
                        if (menuItem.checked) {
                            this.setEnabled(dictionary);
                        } else {
                            this.disable(dictionary);
                        }
                        this.saveEnabledDictionaries();
                    }
                };
                return menu;
            })
        };
    }

    /**
     * Set enabled dictionaries on load
     * Either sets enabled dictionaries to saved preferences, or enables the first
     * dictionary that is valid based on system (defaults to en_US)
     */
    setEnabledDictionaries () {
        const dictionaries = this.dictionaries;
        if (dictionaries) {
            // Dictionary disabled
            if (dictionaries.length === 0) {
                return;
            }
            if (this.setEnabled(dictionaries)) {
                return;
            }
        }

        if (this.userLanguage) {
            if (this.setEnabled(this.userLanguage)) {
                return;
            }
            if (this.userLanguage.split('_') !== -1 && this.setEnabled(this.userLanguage.split('_')[0])) {
                return;
            }
        }

        let navigatorLanguage = navigator.language.replace('-', '_');
        if (this.setEnabled(navigatorLanguage)) {
            return;
        }

        if (navigatorLanguage.split('_') !== -1 && this.setEnabled(this.navigatorLanguage.split('_')[0])) {
            return;
        }

        if (this.setEnabled('en_US')) {
            return;
        }

        if (!this.setEnabled('en')) {
            console.log('Unable to set a language for the spell checker - Spell checker is disabled');
        }

    }

    loadAvailableDictionaries () {
        this.availableDictionaries = checker.getAvailableDictionaries().sort();
        if (this.availableDictionaries.length === 0) {
            this.multiLanguage = false;
            // Dictionaries path is correct for build
            this.dictionariesPath = path.join(remote.app.getAppPath(), '../dictionaries');
            this.availableDictionaries = [
                'en_GB',
                'en_US',
                'es_ES',
                'pt_BR'
            ];
        } else {
            this.multiLanguage = !isWindows;
            this.availableDictionaries = this.availableDictionaries.map((dict) => dict.replace('-', '_'));
        }
    }

    setEnabled (dictionaries) {
        dictionaries = [].concat(dictionaries);
        let result = false;
        for (let i = 0; i < dictionaries.length; i++) {
            if (this.availableDictionaries.indexOf(dictionaries[i]) !== -1) {
                result = true;
                this.enabledDictionaries.push(dictionaries[i]);
                // If using Hunspell or Windows then only allow 1 language for performance reasons
                if (!this.multiLanguage) {
                    this.enabledDictionaries = [dictionaries[i]];
                    checker.setDictionary(dictionaries[i], this.dictionariesPath);
                    return true;
                }
            }
        }
        return result;
    }

    disable (dictionary) {
        const pos = this.enabledDictionaries.indexOf(dictionary);
        if (pos !== -1) {
            this.enabledDictionaries.splice(pos, 1);
        }
    }

    getContractions () {
        const contractions = [
            "ain't", "aren't", "can't", "could've", "couldn't", "couldn't've", "didn't", "doesn't", "don't", "hadn't",
            "hadn't've", "hasn't", "haven't", "he'd", "he'd've", "he'll", "he's", "how'd", "how'll", "how's", "I'd",
            "I'd've", "I'll", "I'm", "I've", "isn't", "it'd", "it'd've", "it'll", "it's", "let's", "ma'am", "mightn't",
            "mightn't've", "might've", "mustn't", "must've", "needn't", "not've", "o'clock", "shan't", "she'd", "she'd've",
            "she'll", "she's", "should've", "shouldn't", "shouldn't've", "that'll", "that's", "there'd", "there'd've",
            "there're", "there's", "they'd", "they'd've", "they'll", "they're", "they've", "wasn't", "we'd", "we'd've",
            "we'll", "we're", "we've", "weren't", "what'll", "what're", "what's", "what've", "when's", "where'd",
            "where's", "where've", "who'd", "who'll", "who're", "who's", "who've", "why'll", "why're", "why's", "won't",
            "would've", "wouldn't", "wouldn't've", "y'all", "y'all'd've", "you'd", "you'd've", "you'll", "you're", "you've"
        ];

        const contractionMap = contractions.reduce((acc, word) => {
            acc[word.replace(/'.*/, '')] = true;
            return acc;
        }, {});

        return contractionMap;
    }

    enable () {
        webFrame.setSpellCheckProvider('', false, {
            spellCheck: (text) => this.isCorrect(text)
        });

        this.setupContextMenuListener();
    }

    getMenu () {
        return [
            {
                label: 'Undo',
                role: 'undo'
            },
            {
                label: 'Redo',
                role: 'redo'
            },
            {
                type: 'separator'
            },
            {
                label: 'Cut',
                role: 'cut',
                accelerator: 'CommandOrControl+X',
            },
            {
                label: 'Copy',
                role: 'copy',
                accelerator: 'CommandOrControl+C',
            },
            {
                label: 'Paste',
                role: 'paste',
                accelerator: 'CommandOrControl+V',
            },
            {
                label: 'Select All',
                role: 'selectall',
                accelerator: 'CommandOrControl+A',
            }
        ];
    }

    saveEnabledDictionaries () {
        localStorage.setItem('spellcheckerDictionaries', JSON.stringify(this.enabledDictionaries));
    }

    isCorrect (text) {
        if (!this.enabledDictionaries.length || this.contractions[text.toLocaleLowerCase()]) {
            return true;
        }

        if (this.multiLanguage) {
            for (let i = 0; i < this.enabledDictionaries.length; i++) {
                checker.setDictionary(this.enabledDictionaries[i]);
                if (!checker.isMisspelled(text)) {
                    return true;
                }
            }
        } else {
            return !checker.isMisspelled(text);
        }
        return false;
    }

    getCorrections (text) {
        if (!this.multiLanguage) {
            return checker.getCorrectionsForMisspelling(text);
        }

        const allCorrections = this.enabledDictionaries.map((dictionary) => {
            checker.setDictionary(dictionary);
            return checker.getCorrectionsForMisspelling(text);
        }).filter((c) => c.length > 0);

        const length = Math.max(...allCorrections.map((a) => a.length));

        // Get the best suggestions of each language first
        const corrections = [];
        for (let i = 0; i < length; i++) {
            corrections.push(...allCorrections.map((c) => c[i]).filter((c) => c));
        }

        // Remove duplicates
        return [...new Set(corrections)];
    }

    setupContextMenuListener () {
        window.addEventListener('contextmenu', (event) => {
            event.preventDefault();

            const template = this.getMenu();

            if (this.languagesMenu) {
                template.unshift({ type: 'separator' });
                template.unshift(this.languagesMenu);
            }

            setTimeout(() => {
                if (['TEXTAREA', 'INPUT'].indexOf(event.target.nodeName) > -1) {
                    const text = window.getSelection().toString().trim();
                    if (text !== '' && !this.isCorrect(text)) {
                        const options = this.getCorrections(text);
                        const maxItems = Math.min(options.length, 6);

                        if (maxItems > 0) {
                            const suggestions = [];
                            const onClick = function (menuItem) {
                                webContents.replaceMisspelling(menuItem.label);
                            };

                            for (let i = 0; i < options.length; i++) {
                                const item = options[i];
                                suggestions.push({ label: item, click: onClick });
                            }

                            template.unshift({ type: 'separator' });

                            if (suggestions.length > maxItems) {
                                const moreSuggestions = {
                                    label: 'More spelling suggestions',
                                    submenu: suggestions.slice(maxItems)
                                };
                                template.unshift(moreSuggestions);
                            }

                            template.unshift.apply(template, suggestions.slice(0, maxItems));
                        } else {
                            template.unshift({ label: 'No suggestions', enabled: false });
                        }
                    }
                }

                menu = remote.Menu.buildFromTemplate(template);
                menu.popup(remote.getCurrentWindow(), undefined, undefined, 5);
            }, 0);
        }, false);
    }
}

module.exports = SpellCheck;
