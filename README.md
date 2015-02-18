Simple Stock Exchange
=====================

Async, non-blocking HTTP web server and framework,
designed to pull live data from Benzinga's stock API.

This service attempts to provide real-time bid and
asking prices currently on stocks, and allowing
investors to buy or sell stocks.

Quick'n'Dirty
-------------

Requires Python 2.6 <-> 3.4

* Install virtualenv
* Create a virtualenv
* Install nodejs

Bower
```
	$ npm install -g bower
```

Python Application
```
	$ pip install -r conf/requirements.txt
	$ bower install
```

Run it
```
	$ python app.py
```

Credits
-------
Eric Bower
