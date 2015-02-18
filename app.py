from __future__ import print_function
import json
import os.path
import logging

import tornado.web
import tornado.ioloop
import tornado.websocket
from tornado import gen, ioloop
from tornado.httpclient import AsyncHTTPClient, HTTPError
from tornado.options import define, options, \
    parse_command_line, parse_config_file

define("port", default=8888, help="run on the given port", type=int)
define("benzinga_endpoint", default="http://data.benzinga.com/stock",
        help="benzinga stock base URL", type=str)

base_dir = os.path.dirname(__file__)
parse_config_file(os.path.join(base_dir, "settings.cfg"))

# list of active trade websocket connections
connections = []


class Main(tornado.web.RequestHandler):
    @tornado.web.asynchronous
    def get(self):
        self.render("index.html")


class Trade(tornado.web.RequestHandler):
    @tornado.web.asynchronous
    def get(self):
        self.render("trade.html")


class TradeSocket(tornado.websocket.WebSocketHandler):
    """ Trade websocket """

    def open(self):
        if self not in connections:
            connections.append(self)
        logging.info("new trade connection!")

        # get templates, send them to client
        with open("templates/stock.mustache", "r") as fp:
            stock_template = fp.read()

        with open("templates/portfolio.mustache", "r") as fp:
            portfolio_template = fp.read()

        with open("templates/modal.mustache", "r") as fp:
            modal_template = fp.read()

        templates = {
            "stock": stock_template,
            "portfolio": portfolio_template,
            "modal": modal_template,
        }

        # send templates to client
        self.write_message(json.dumps({
            "templates": templates,
        }))

        # update every connection's client
        for conn in connections:
            conn.write_message(json.dumps({
                "users": len(connections),
            }))

    @gen.coroutine
    def on_message(self, message):
        http_client = AsyncHTTPClient()
        mes = json.loads(message)
        logging.info("on message: %s" % mes)

        # find symbol via benzinga stock API
        if "symbols" in mes:
            # set person's current symbol
            self.symbols = mes['symbols'].split(",")
            self.symbols = [item.strip() for item in self.symbols]

            # grab symbol data
            endpoints = [os.path.join(options.benzinga_endpoint, symbol) \
                            for symbol in self.symbols]
            logging.warning(endpoints)
            try:
                responses = yield [http_client.fetch(ep) for ep in endpoints]
            except HTTPError as err:
                logging.error("HTTP Error: %s" % err)
            # send data back to client
            stocks = [json.loads(res.body.decode('utf-8')) \
                        for res in responses]
            self.write_message(json.dumps({ "stocks": stocks }))

        # user is attempting to buy stocks
        if "buy" in mes:
            ep = os.path.join(options.benzinga_endpoint, mes['buy']['symbol'])

            try:
                res = yield http_client.fetch(ep)
            except HTTPError as err:
                logging.error("HTTP Error: %s" % err)

            stock = json.loads(res.body.decode('utf-8'))

            if "status" in stock:
                logging.error("Stock status error!")
            else:
                self.write_message(json.dumps({
                    "bought": True,
                    "stock": stock,
                    "quantity": mes['buy']['quantity'],
                    "ask": mes['buy']['ask']
                }))

        # user is attempting to sell stocks
        if "sell" in mes:
            ep = os.path.join(options.benzinga_endpoint, mes['sell']['symbol'])

            try:
                res = yield http_client.fetch(ep)
            except HTTPError as err:
                logging.error("HTTP Error: %s" % err)

            stock = json.loads(res.body.decode('utf-8'))

            if "status" in stock:
                logging.error("Stock status error!")
            else:
                self.write_message(json.dumps({
                    "sold": True,
                    "stock": stock,
                    "quantity": mes['sell']['quantity'],
                    "bid": mes['sell']['bid']
                }))

        # user is attempting to get stock data
        if "get_stock" in mes:
            ep = os.path.join(options.benzinga_endpoint, mes['symbol'])

            try:
                res = yield http_client.fetch(ep)
            except HTTPError as err:
                logging.error("HTTP Error: %s" % err)

            stock = json.loads(res.body.decode('utf-8'))

            if "status" in stock:
                logging.error("Stock status error!")
            else:
                self.write_message(json.dumps({
                    "get_stock": stock
                }))

    def on_close(self):
        logging.info("trade connection closed")
        connections.remove(self)
        # update every connection's client
        for conn in connections:
            conn.write_message(json.dumps({
                "users": len(connections),
            }))

def init_server():
    """ Initiate the server """
    parse_command_line()
    app = tornado.web.Application([
            (r"/", Main),
            (r"/trade", Trade),
            (r"/tradesocket", TradeSocket),
        ],
        debug=True,
        template_path=os.path.join(base_dir, "templates"),
        static_path=os.path.join(base_dir, "static"),
    )
    app.listen(options.port)
    tornado.ioloop.IOLoop.instance().start()

if __name__ == "__main__":
    logging.info("Server booting up ...")
    init_server()
