from setuptools import setup, find_packages

setup(
    name="rapidpassives",
    version="0.1.0",
    author="Milan Rother",
    author_email="milan.rother@gmx.de",
    description="Automatic DRC-clean Layout Generation of Inductors and Transformers",
    url="https://github.com/milanofthe/rapidpassives",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.10",
    install_requires=[
        "numpy",
        "matplotlib",
        "gdstk"
    ],
)