.PHONY: install dev start test lint format check daemon daemon-stop logs hooks clean

install:
	mise install && npm install && npm --prefix web install

dev:
	mise run dev

start:
	mise run start

test:
	mise run test

lint:
	mise run lint

format:
	mise run format

check:
	mise run check

daemon:
	mise daemons start api

daemon-stop:
	mise daemons stop api

logs:
	mise daemons logs api

hooks:
	mise exec -- hk install

clean:
	rm -rf dist
