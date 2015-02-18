/*
*
* Primary logic for trading
* Buy and sell stocks and dump
* bought stocks into a portfolio
*
*/
$(function() {

    // Handlebars templates
    var stock_template;
    var portfolio_template;
    var modal_template;

    /*
    * Websocket used for constant streaming of data after initial handshake
    * websocket connection persists throughout the entirety of a connection
    */
    var ws = new WebSocket("ws://" + socket_domain  + "/tradesocket");

    // when we receive a message from the server,
    // figure out what to do with it
    ws.onmessage = function(evt) {
        var response = jQuery.parseJSON(evt.data);
        console.log(response);

        if (response.hasOwnProperty("users")) {
            $("#sse-trader-count").html(response.users);
        }

        // setup handlebars templating
        if (response.hasOwnProperty("templates")) {
            stock_template = Handlebars.compile(response.templates.stock);
            portfolio_template = Handlebars.compile(response.templates.portfolio);
            modal_template = Handlebars.compile(response.templates.modal);
        }

        // after searching for stocks, display content
        if (response.hasOwnProperty("stocks")) {
            var stocks = response.stocks;
            var valid_stocks = [];

            // find valid stocks that had a
            // correct match on benzinga's server
            for (var i = 0; i < stocks.length; i++) {
                if (!stocks[i].hasOwnProperty("status")) {
                    valid_stocks.push(stocks[i]);
                }
            }

            if (valid_stocks.length > 0) {
                $("#sse_find_help").html("stock(s) found!");
                $("#sse_find_help")
                    .parent()
                    .removeClass("has-error")
                    .addClass("has-success");

                var context = { "stocks": valid_stocks };
                var html = stock_template(context);
                $("#sse_stocks").html(html);
            } else {
                $("#sse_find_help").html("No stocks found!");
                $("#sse_find_help")
                    .parent()
                    .removeClass("has-success")
                    .addClass("has-error");
                $("#sse_stocks").html("");
            }
        }

        // after purchasing stocks, display content
        if (response.hasOwnProperty("bought")) {
            var losses = response.ask * response.quantity;
            var total_cash = parseFloat($("#sse_cash").text()) - losses;

            $("#sse_cash").html(total_cash.toFixed(2));
            $("#sse_delta")
                .removeClass("sse-gain")
                .addClass("sse-loss")
                .html("delta: -$" + losses.toFixed(2));
            var found_company = false;

            // update portfolio after purchasing stocks
            $("#sse_portfolio > div").each(function() {
                var symbol = $(this).data("symbol");
                if (response.stock.symbol == symbol) {
                    found_company = true;
                    var quantity = $(this).find(".sse-portfolio-quantity");
                    quantity.html(parseInt(quantity.text()) + parseInt(response.quantity));
                }
            });

            if (!found_company) {
                var context = {
                    "symbol": response.stock.symbol,
                    "name": response.stock.name,
                    "quantity": response.quantity,
                    "ask": response.ask
                };
                var html = portfolio_template(context);
                $("#sse_portfolio").append(html);
            }
        }

        // after selling stocks, display content
        if (response.hasOwnProperty("sold")) {
            var gains = response.bid * response.quantity;
            var total_cash = parseFloat($("#sse_cash").text()) + gains;
            $("#sse_cash").html(total_cash.toFixed(2));
            $("#sse_delta")
                .removeClass("sse-loss")
                .addClass("sse-gain")
                .html("delta: +$" + gains.toFixed(2));

            // update portfolio after selling stocks
            $("#sse_portfolio > div").each(function() {
                var symbol = $(this).data("symbol");
                if (response.stock.symbol == symbol) {
                    var quantity = $(this).find(".sse-portfolio-quantity");
                    var total_quantity = parseInt(quantity.text()) - parseInt(response.quantity);
                    if (total_quantity == 0) {
                        $(this).remove();
                    } else {
                        quantity.html(total_quantity);
                    }
                }
            });
        }

        if (response.hasOwnProperty("get_stock")) {
            var html = modal_template(response.get_stock);
            $("#sse_modal").html(html);
            $(".modal").modal("toggle");
        }
    };

    ws.onopen = function(evt) {
        console.log("person connected!");

        $("#sse_find_symbol").on("click", function() {
            ws.send(JSON.stringify({ "symbols": $("#sse_symbols").val() }));
        });
    };

        // event handler to display stock data in a modal
    $("body").on("click", ".sse-display-stock", function() {
        ws.send(JSON.stringify({
            "get_stock": true,
            "symbol": $(this).data("symbol")
        }));
    });

    // event handler for buying stocks
    $("body").on("click", ".sse-buy", function() {
        var parent_el = $(this).parent().parent().parent();
        var quantity = get_stock_quantity(this);
        var symbol = get_stock_symbol(this);
        var ask = parent_el
                    .find(".sse-ask")
                    .data("ask");

        if (!check_quantity(parent_el, quantity)) {
            return;
        }

        // can it be a valid number?
        if (isNaN(parseInt(quantity))) {
            parent_el
                .find(".form-group")
                .removeClass("has-success")
                .addClass("has-error");
            parent_el
                .find(".help-block")
                .html("Quantity must be a number");

            return;
        }

        parent_el
            .find(".form-group")
            .removeClass("has-error")
        parent_el
            .find(".help-block")
            .html("Buying ...");

        var total_cost = ask * quantity;
        var cash = $("#sse_cash").text();

        if (total_cost > cash) {
            parent_el
                .find(".form-group")
                .removeClass("has-success")
                .addClass("has-error");
            parent_el
                .find(".help-block")
                .html("You do not have enough cash to buy these stocks!");

            return;
        }

        ws.send(JSON.stringify({
            "buy": {
                "ask": ask,
                "symbol": symbol,
                "quantity": quantity
            }
        }));

    });

    // event handler for selling stocks
    $("body").on("click", ".sse-sell", function() {
        var parent_el = $(this).parent().parent().parent();
        var quantity = get_stock_quantity(this);
        var symbol = get_stock_symbol(this);
        var bid = parent_el
                    .find(".sse-bid")
                    .data("bid");

        if (!check_quantity(parent_el, quantity)) {
            return;
        }
        // can it be a valid number?
        if (isNaN(parseInt(quantity))) {
            parent_el
                .find(".form-group")
                .removeClass("has-success")
                .addClass("has-error");
            parent_el
                .find(".help-block")
                .html("Quantity must be a number");

            return;
        }

        parent_el
            .find(".form-group")
            .removeClass("has-error");
        parent_el
            .find(".help-block")
            .html("Selling ...");

        // match current company symbol with the identical symbol in portfolio
        // if it exists
        var found_company = false;
        var portfolio_symbol, portfolio_quantity;
        $("#sse_portfolio > div").each(function() {
            portfolio_symbol = $(this).data("symbol");
            if (symbol == portfolio_symbol) {
                found_company = true;
                portfolio_quantity = parseInt($(this).find(".sse-portfolio-quantity").text());
            }
        });

        if (!found_company) {
            parent_el
                .find(".form-group")
                .removeClass("has-success")
                .addClass("has-error");
            parent_el
                .find(".help-block")
                .html("You do not own any of these stocks!");

            return;
        }

        // gotta have more stocks
        // than what you are trying to sell
        if (quantity > portfolio_quantity) {
            parent_el
                .find(".form-group")
                .removeClass("has-success")
                .addClass("has-error");
            parent_el
                .find(".help-block")
                .html("You do not have enough stocks to sell");

            return;
        }

        // if selling passes validation,
        // send to server for processing
        ws.send(JSON.stringify({
            "sell": {
                "bid": bid,
                "symbol": symbol,
                "quantity": quantity
            }
        }));

    });

    function check_quantity(scope, quantity) {
        if (quantity <= 0) {
            scope
                .find(".form-group")
                .removeClass("has-success")
                .addClass("has-error");
            scope
                .find(".help-block")
                .html("Quantity must be a positive whole number!");
            return false;
        }
        return true;
    };

    function get_stock_quantity(scope) {
        var quantity = $(scope)
                            .parent().parent()
                            .find(".sse-quantity")
                            .val();

        return parseInt(quantity.replace(/^-?[^0-9\.]/g, ""));
    };

    function get_stock_symbol(scope) {
        var symbol = $(scope)
                        .parent().parent().parent()
                        .find(".sse-display-stock")
                        .data("symbol");

        return symbol;
    };

});