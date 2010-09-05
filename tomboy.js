// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 2 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

DBus = imports.dbus;
GLib = imports.gi.GLib;
Gtk = imports.gi.Gtk;
Gdk = imports.gi.Gdk;

// add some escaping functions to String prototype
String.prototype.xmlEscape = function() {
	return this.replace(/\&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
		.replace(/\'/g,'&apos;').replace(/\"/g,'&quot;');
}

// create the Tomboy DBus object
function Tomboy()
{
    this._init();
}
Tomboy.prototype = {
    _init: function()
    {
		DBus.session.proxifyObject(this, 'org.gnome.Tomboy', '/org/gnome/Tomboy/RemoteControl' );
    },
};
var TomboyIface = {
    name: 'org.gnome.Tomboy.RemoteControl',
    methods: [
		{ name: 'CreateNamedNote', inSignature: 's', outSignature: 's' },
		{ name: 'SetNoteContentsXml', inSignature: 'ss', outSignature: 'b' },
		{ name: 'FindNote', inSignature: 's', outSignature: 's' },
		{ name: 'NoteExists', inSignature: 's', outSignature: 'b' },
		{ name: 'GetNoteContentsXml', inSignature: 's', outSignature: 's' },
		{ name: 'AddTagToNote', inSignature: 'ss', outSignature: '' },
		{ name: 'DisplayNote', inSignature: 's', outSignature: '' }
    ]
};
DBus.proxifyPrototype (Tomboy.prototype, TomboyIface);

// create our globals
var tomboy = null;
var _selection_data = '';

// function to create tomboy note. accepts EphyWindow
var create_tomboy_note = function(window)
{
	// short circuit if nothing selected.
	if (!_selection_data) {
		return;
	}

	// get title, url, and selection; and encode data for XML
	var web_view = window.get_active_child().get_web_view();
	var url = web_view.get_location(true).xmlEscape();
	var title = web_view.get_title().xmlEscape();
	var content = _selection_data.xmlEscape();
	var notebook = 'Snippets'; // this should be an option

	// connect to DBus if we are not yet.
	if (!tomboy) {
		tomboy = new Tomboy();
	}

	//make the URL look nice, and linkify
	url = "\n\n<italic><size:small>Source: <link:url>" + url + "</link:url></size:small></italic>\n\n";

	try {
		// If note title exists append new contents to current contents
		// Or should we create a new note?
		if ( tomboy.NoteExistsRemoteSync(tomboy.FindNoteRemoteSync(title)) == 1 ) {
			var uri = tomboy.FindNoteRemoteSync(title);
			var current_contents = tomboy.GetNoteContentsXmlRemoteSync(uri);
			var separator = "<strike>\n                                    \n</strike>"
			tomboy.SetNoteContentsXmlRemoteSync(uri, "<note-content>" + current_contents + separator
				+ content + url + "</note-content>");
			tomboy.AddTagToNoteRemoteSync(uri, "system:notebook:" + notebook);
			tomboy.DisplayNoteRemote(uri);
		}
		// no existing note, create new one
		else {
			var uri = tomboy.CreateNamedNoteRemoteSync(title);
			tomboy.SetNoteContentsXmlRemoteSync(uri, "<note-content>" + title + "\n\n" + content
				+ url + "</note-content>");
			tomboy.AddTagToNoteRemoteSync(uri, "system:notebook:" + notebook);
			tomboy.DisplayNoteRemote(uri);
		}
	}
	catch (e) {
		print(e);
	}

	// clear the selection buffer
	_selection_data = '';
}

// catch all newly selected text in the global var
var _get_selection_cb = function (clipboard, event)
{
	_selection_data = clipboard.wait_for_text()
}

// listen for key pressed, act on ctrl+shift+B
var key_pressed_cb = function (window, event)
{
	if(event.key.state & Gdk.ModifierType.CONTROL_MASK &&
		event.key.state & Gdk.ModifierType.SHIFT_MASK)
	{
		if(event.key.keyval == Gdk.B)
		{
			create_tomboy_note(window);
		}
	}
	return false;
}

// extend into the outer reaches of space.
extension = {
	attach_window: function(window)
	{
		window._tomboy_key_pressed_signal = window.signal.key_press_event.connect(key_pressed_cb);
		window._tomboy_clipboard_signal = Gtk.Clipboard.get(Gdk.atom_intern("PRIMARY")).signal
			.owner_change.connect(_get_selection_cb);
	},
	detach_window: function(window)
	{
		window.signal.disconnect(window._tomboy_key_pressed_signal);
		Gtk.Clipboard.get(Gdk.atom_intern("PRIMARY")).signal
			.disconnect(window._tomboy_clipboard_signal);
	}
}
