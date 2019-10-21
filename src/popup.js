// IIFE
(() => {

const EXTENSION_NAME = 'Site Favourites';
const EXTENSION_VERSION = '1.0'; // Can't read the manifest from here

let domain = 'unknown'

initialise()
return

function initialise () {
    chrome.tabs.query({currentWindow: true, active: true}, tabs => {
        if (tabs[0]) {
            domain = new URL(tabs[0].url).hostname
            $('h1 .site').text(domain)
        }
        getJsonFromStorage('favourites', []).then(favourites => {
            favourites.forEach(addToFavouritesMenu)
            $('.sf-add').on('click', onAdd)
            $('.sf-favourites').on('click', '.sf-remove', onRemove)
            $('.sf-favourites').on('click', '.sf-link', onLink)
        })
    })
}

function onAdd(event) {
    event.preventDefault()
    chrome.tabs.query({currentWindow: true, active: true}, tabs => {
        addToFavourites(tabs[0])
    })
}

function onRemove(event) {
    event.preventDefault()
    removeFromFavourites({element: this})
}

function onLink(event) {
    event.preventDefault()
    goToFavourite({element: this})
}

function getJsonFromStorage (subkey, fallback) {
    return new Promise((resolve,reject) => {
        const key = `${domain}.${subkey}`
        chrome.storage.local.get(key, values => {
                if (chrome.runtime.lastError) {
                    console.log(`${EXTENSION_NAME} failed to read ${key} from extension storage`, chrome.runtime.lastError)
                    resolve(fallback)
                }
                else {
                    resolve(values[key] || fallback)
                }
        })
    })
}

function saveJsonToStorage (subkey, value) {
    return new Promise((resolve,reject) => {
        const key = `${domain}.${subkey}`
        chrome.storage.local.set({[key]: value}, () => {
                if (chrome.runtime.lastError) {
                    console.log(`${EXTENSION_NAME} failed to save ${key} to extension storage`, chrome.runtime.lastError)
                    reject()
                }
                else {
                    resolve()
                }
        })
    })
}

function addToFavourites ({title, url} = {}) {
    if (url) {
        title = title || url
        getJsonFromStorage('favourites', []).then(favourites => {
            if ( ! favourites.find(e => e.url === url)) {
                favourites.push({title, url})
                saveJsonToStorage('favourites', favourites)
                addToFavouritesMenu({title, url})
            }
            // Add, then quickly remove, the "added" class, and let css transitions fade nicely
            const items = $('.sf-favourites li').filter(function () { return $(this).find('a.sf-link').attr('href') === url })
            items.addClass('added')
            setTimeout(() => items.removeClass('added'), 100)
        })
    }
}

function addToFavouritesMenu({title, url}) {
    $('.sf-favourites').append(`<li><a href="#" class="sf-remove">&times;</a><a class="sf-link" href="${url}">${title}</a>`)
}

function removeFromFavourites ({element}) {
    getJsonFromStorage('favourites', []).then(favourites => {
        const item = $(element).closest('li')
        const url = item.find('a.sf-link').attr('href')
        saveJsonToStorage('favourites', favourites.filter(e => e.url !== url))
        item.addClass('deleted')
            .on('transitionend', () => { item.remove() })
    })
}

function goToFavourite ({element}) {
    const url = $(element).attr('href')
    chrome.tabs.executeScript({
        code: `document.location="${url}"`
    })
}

// End of IIFE
})();
