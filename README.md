SiteFavourites
=========
This is a browser plugin that implements a favourites list for each site.

Features
--------
Click the icon (top-right) to manage the list of favourites for the current site.
The favourites are stored as regular bookmarks in
`Other Bookmarks/Site Favourites/<site name>`
so will be synced across devices as usual for bookmarks.

Install in Chrome
-------
Install from the Chrome Web Store:

* https://chrome.google.com/webstore/detail/site-favourites/plalahfecpgkkochlldlbdnacljkomfo

Install from source:

1. Go to chrome://extensions/
2. Enable **Developer mode**
3. Click **Load Unpacked**
4. Select the **extension/src** folder

Developers: Release a new version
----------
To build a new release:

1. Update the version number in manifest.json
2. Commit all changes
3. `cd ` _project directory_
4. `git tag version-`_version_
5. `zip -r site-favourites-`_version_`.zip src`

Log in to https://chrome.google.com/webstore/developer/dashboard and upload the zip file to the Chrome web store. It can then be installed and updated like any other Chrome extension.
