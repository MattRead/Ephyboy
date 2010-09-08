/**
 * EpiBoy v0.1
 * Create a Tomboy note from selected text in epiphany
 *
 * GPL licensed.
 * Copyright (c) 2010 Matt Read <matt@mattread.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// import needed libraries
Epiphany = imports.gi.Epiphany;
DBus = imports.dbus;
Gtk = imports.gi.Gtk;
Gdk = imports.gi.Gdk;
GdkPixbuf = imports.gi.GdkPixbuf;

// add some escaping functions to String prototype
String.prototype.xmlEscape = function() {
    return this.replace(/\&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
               .replace(/\'/g,'&apos;').replace(/\"/g,'&quot;');
};

// create the Tomboy DBus object
function Tomboy()
{
    this._init();
}

Tomboy.prototype = {
    _init: function()
    {
        DBus.session.proxifyObject(this, 'org.gnome.Tomboy', '/org/gnome/Tomboy/RemoteControl' );
    }
};

// Tomboy DBus interface
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
DBus.proxifyPrototype(Tomboy.prototype, TomboyIface);

// create our globals
var tomboy = null;

// function to create tomboy note. accepts EphyWindow
var create_tomboy_note = function(event, window)
{
    // connect to DBus if we are not yet.
    if (!tomboy)
        tomboy = new Tomboy();

    // short circuit if nothing selected. This doesn't really work
    var content = window.get_clipboard(Gdk.atom_intern("PRIMARY")).wait_for_text().xmlEscape();

    if (!content)
        return false;

    // get title, url, and selection; and encode data for XML
    var web_view = window.get_active_child().get_web_view();
    var url = web_view.get_location(true).xmlEscape();
    var title = web_view.get_title().xmlEscape();
    var notebook = 'Snippets'; // this should be an option
    var uri = '';

    //make the URL look nice, and linkify
    url = "\n\n<italic><size:small>Source: <link:url>" + url +
          "</link:url></size:small></italic>\n\n";

    try {
        // If note title exists append new contents to current contents
        // Or should we create a new note?
        if (tomboy.NoteExistsRemoteSync(tomboy.FindNoteRemoteSync(title)) == 1) {
            uri = tomboy.FindNoteRemoteSync(title);
            var current_contents = tomboy.GetNoteContentsXmlRemoteSync(uri);
            var separator = "<strike>\n                                    \n</strike>";
            tomboy.SetNoteContentsXmlRemoteSync(uri, "<note-content>" + current_contents +
                                                separator + content + url + "</note-content>");
            tomboy.AddTagToNoteRemoteSync(uri, "system:notebook:" + notebook);
            tomboy.DisplayNoteRemote(uri);
        }
        // no existing note, create new one
        else {
            uri = tomboy.CreateNamedNoteRemoteSync(title);
            tomboy.SetNoteContentsXmlRemoteSync(uri, "<note-content>" + title + "\n\n" + content +
                                                url + "</note-content>");
            tomboy.AddTagToNoteRemoteSync(uri, "system:notebook:" + notebook);
            tomboy.DisplayNoteRemote(uri);
        }
    }
    catch (e) {
        print(e);
    }

    return false;
};

// listen for key pressed, act on ctrl+shift+B
var key_pressed_cb = function (window, event)
{
    if (event.key.state & Gdk.ModifierType.CONTROL_MASK &&
        event.key.state & Gdk.ModifierType.SHIFT_MASK) {
        if (event.key.keyval == Gdk.B) {
            create_tomboy_note(event, window);
        }
    }
    return false;
};

// extend into the outer reaches of space.
extension = {
    attach_window: function(window)
    {
        window._tomboy_key_pressed_signal = window.signal.key_press_event
                                                  .connect(key_pressed_cb, window);

        // create the tomboy icon cause I don't know if it has a stock_id
        // TODO find a way for seed to get this file dir and use supplied icon.
        var icon_factory = new Gtk.IconFactory();
        icon_factory.add('tomboy', new Gtk.IconSet.from_pixbuf(
            new GdkPixbuf.Pixbuf.from_file('/usr/share/icons/hicolor/scalable/apps/tomboy.svg')
        ));
        icon_factory.add_default();

        // Create the action and group to add to menubar
        var action = new Gtk.Action({
            name: 'TomboyNote',
            label: '_Tomboy Note',
            tooltip: 'Create a Tomboy note from selection',
            stock_id: 'tomboy'
        });
        action.signal.activate.connect(create_tomboy_note, window);
        var action_group = new Gtk.ActionGroup({name: "TomboyNoteActionGroup"});
        action_group.add_action(action);

        var ui_manager = window.get_ui_manager();
        ui_manager.insert_action_group(action_group, 0);
        var merge_id = ui_manager.new_merge_id();
        ui_manager.add_ui(merge_id, "/menubar/ToolsMenu", "TomboyNoteMenu", "TomboyNote",
                          Gtk.UIManagerItemType.MENUITEM, false);

        // store everything so we can remove it on detach
        window._tomboy_menu = {
            ui_manager: ui_manager,
            merge_id: merge_id,
            action: action,
            action_group: action_group
        };

        var toolbars_model = Epiphany.EphyShell.get_default().get_toolbars_model(false);
        toolbars_model.set_name_flags("TomboyNote", 4); // EGG_TB_MODEL_NAME_KNOWN
    },
    detach_window: function(window)
    {
        window.signal.disconnect(window._tomboy_key_pressed_signal);
        // remove button and menu and shtuff
        var tomboy_menu = window._tomboy_menu;
        tomboy_menu.ui_manager.remove_ui(tomboy_menu.merge_id);
        tomboy_menu.ui_manager.remove_action_group(tomboy_menu.action_group);
        tomboy_menu.group.remove_action(tomboy_menu.action);
        delete window._tomboy_menu;
    }
};
